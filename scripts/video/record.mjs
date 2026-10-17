// Records the playtest launch video's clips frame by frame: starts a dev server, opens each
// clip's scene in headless Chromium with a fake clock, advances the clock exactly one video
// frame at a time and saves a screenshot per frame to video/frames/<clip>/. The game moves the
// same amount each frame however slow the render is, so the video plays smoothly.
// Usage: npm run video [-- --preview] [-- --only <clip>] [-- --no-assemble]
// --preview: half-size frames at 15 fps, for a quick look at timing. The shot list is in shots.mjs.
import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clips } from "./shots.mjs";
import { assemble } from "./assemble.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const strOpt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const preview = flag("preview");
// The page is always laid out at 1920x1080 so the HUD sits where it will in the video; the
// preview only saves its screenshots at half size.
const width = 1920;
const height = 1080;
const fps = preview ? 15 : 30;
const only = strOpt("only");
const framesDir = preview ? "video/frames-preview" : "video/frames";
const endCard = fileURLToPath(new URL("./endcard.html", import.meta.url));

const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0];

// The GPU makes rendering many times faster than the software renderer `npm run shot` uses;
// --cpu falls back to that one.
const browser = await chromium.launch(
  flag("cpu")
    ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }
    : { channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
);
try {
  for (const clip of clips) {
    if (only && clip.name !== only) continue;
    await recordClip(clip);
  }
} finally {
  await browser.close();
  await server.close();
}
if (!flag("no-assemble") && !only) await assemble({ framesDir, fps, preview, clips });

async function recordClip(clip) {
  const dir = `${framesDir}/${clip.name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const errors = [];

  // A clip with `variants` tries each setup in turn until `accept` says the warm-up ended
  // where the clip needs it (a fight that ends in VICTORY).
  let page = null;
  let setup = null;
  for (const [i, v] of (clip.variants ?? [clip.setup]).entries()) {
    page = await openScene(clip, v, errors, clip.warmup);
    if (!clip.accept || (await page.evaluate(clip.accept))) {
      setup = v;
      break;
    }
    console.log(`${clip.name}: take ${i + 1} not accepted, trying the next one`);
    await page.close();
    page = null;
  }
  if (!page) throw new Error(`${clip.name}: no take was accepted`);

  // `lead`: now that the moment is known (sim time when the warm-up ended), play the same
  // take again up to `lead.simS` before it and record through it. If that take does not end
  // the same way, fall back to recording from the moment itself.
  if (clip.lead) {
    const end = await page.evaluate(() => window.__ares.game.simTime);
    const upTo = clip.warmup.map((w) => (w.until ? { ...w, until: (t) => window.__ares.game.simTime >= t, arg: end - clip.lead.simS } : w));
    const retake = await openScene(clip, setup, errors, upTo);
    // The warm-up's `each` keeps running on the same 100 ms beat, so the fight stays the same.
    await recordFrames(retake, clip, dir, errors, clip.warmup.find((w) => w.until)?.each);
    const ok = await retake.evaluate(clip.accept);
    await retake.close();
    if (ok) {
      await page.close();
      return;
    }
    console.log(`${clip.name}: the lead-in take ended differently; recording from the moment itself`);
  }
  await recordFrames(page, clip, dir, errors);
  await page.close();
}

/**
 * Records the clip's frames. The clock moves in whole milliseconds (33, 33, 34 at 30 fps), so
 * it stays on the same 100 ms beat as the warm-up; `each` (optional) runs on that beat, exactly
 * as it did in the warm-up.
 */
async function recordFrames(page, clip, dir, errors, each) {
  if (clip.perFrame) await page.evaluate(clip.perFrame, { t: 0, seconds: clip.seconds });
  if (!clip.lead) await page.clock.runFor(500); // the camera settles on its first position

  const frames = Math.round(clip.seconds * fps);
  const events = [...(clip.events ?? [])].sort((a, b) => a.at - b.at);
  let next = 0;
  let clockMs = 0;
  let beat = 0;
  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    while (next < events.length && events[next].at <= t) {
      await page.evaluate(events[next].run, events[next].arg);
      next++;
    }
    if (clip.perFrame) await page.evaluate(clip.perFrame, { t, seconds: clip.seconds });
    await page.evaluate(setCaption, { text: clip.caption ?? "", sub: clip.sub ?? "", opacity: captionOpacity(clip, t) });
    const target = Math.round(((f + 1) * 1000) / fps);
    while (each && beat < target) {
      if (beat > clockMs) await page.clock.runFor(beat - clockMs);
      clockMs = beat;
      await page.evaluate(each);
      beat += 100;
    }
    await page.clock.runFor(target - clockMs);
    clockMs = target;
    await page.screenshot({ path: `${dir}/${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
  }
  console.log(`${clip.name}: ${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  if (errors.length) console.error(`${clip.name} page errors:\n` + errors.join("\n"));
  errors.length = 0;
}

/** Opens the clip's page, runs its setup and plays the warm-up. */
async function openScene(clip, setup, errors, warmup) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: preview ? 0.5 : 1 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.clock.install({ time: 0 });

  if (clip.page === "endcard") {
    await page.goto(`file://${endCard}`);
    await page.clock.pauseAt(Math.ceil((await page.evaluate(() => Date.now())) / 400) * 400 + 400);
  } else {
    await page.goto(`${base}?${clip.query}`);
    await page.waitForFunction(() => window.__aresReady === true, null, { timeout: 20000 });
    await startRepeatable(page);
  }
  await page.evaluate(injectCaption);
  if (setup) await page.evaluate(setup);

  // Warm-up: let the scene play (unrecorded) until the clip's moment.
  for (const step of warmup ?? []) {
    if (step.run) await page.evaluate(step.run, step.arg);
    if (step.until) {
      let ms = 0;
      while (!(await page.evaluate(step.until, step.arg))) {
        if (step.each) await page.evaluate(step.each);
        await page.clock.runFor(100);
        if ((ms += 100) > (step.maxS ?? 60) * 1000) throw new Error(`${clip.name}: warm-up never reached its moment`);
      }
    } else {
      for (let ms = 0; ms < (step.s ?? 0) * 1000; ms += 100) {
        if (step.each) await page.evaluate(step.each);
        await page.clock.runFor(100);
      }
    }
  }
  return page;
}

/**
 * Makes every take of a clip play out the same. The fake clock runs on real time until it is
 * paused, and how long the page took to load decides where the sim stands, so a fight could
 * end differently each run. Pausing the clock on a 400 ms mark (a whole number of the fake
 * clock's 16 ms animation frames and of the 100 ms warm-up steps) and restarting the scenario
 * there (after a few frames, so the frame loop is on the fake clock's steps) gives the same frames, ticks and commands every run. The restart's log line and notice
 * are put back to what a fresh start shows.
 */
async function startRepeatable(page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(Math.ceil(now / 400) * 400 + 400);
  await page.clock.runFor(400); // the frame after the pause can hold a real-time step: let it pass
  await page.evaluate(() => {
    const { game } = window.__ares;
    game.restart();
    game.notice = null;
    const fresh = (x) => x.replace(/: RESTARTED$/, ": STARTED");
    game.alertLog = game.alertLog.map((e) => ({ ...e, text: fresh(e.text), tpl: fresh(e.tpl) }));
  });
}

/** Caption fades in after captionAt, out before the clip ends. */
function captionOpacity(clip, t) {
  if (!clip.caption) return 0;
  const start = clip.captionAt ?? 0.4;
  const end = clip.seconds - (clip.captionOut ?? 0.5);
  const fade = 0.4;
  return Math.max(0, Math.min(1, (t - start) / fade, (end - t) / fade));
}

// Runs in the page: the caption overlay, in the game's fonts and HUD colors.
function injectCaption() {
  const style = document.createElement("style");
  style.textContent = `
    #video-caption { position: fixed; left: 0; right: 0; top: 11%; z-index: 99999; pointer-events: none;
      display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
    #video-caption .main { font-family: Oxanium, sans-serif; font-weight: 600; font-size: 46px;
      letter-spacing: 0.06em; text-transform: uppercase; color: #e8f6ff;
      padding: 12px 34px; background: rgba(2, 8, 14, 0.62); border-top: 1px solid rgba(110, 200, 255, 0.55);
      border-bottom: 1px solid rgba(110, 200, 255, 0.55); text-shadow: 0 0 18px rgba(80, 180, 255, 0.55); }
    #video-caption .sub { font-family: "Share Tech Mono", monospace; font-size: 24px; letter-spacing: 0.12em;
      color: #9fd4f5; text-shadow: 0 0 10px rgba(0, 0, 0, 0.9); }
    #video-caption .sub:empty { display: none; }`;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.id = "video-caption";
  el.innerHTML = `<div class="main"></div><div class="sub"></div>`;
  el.style.opacity = "0";
  document.body.appendChild(el);
}

function setCaption({ text, sub, opacity }) {
  const el = document.getElementById("video-caption");
  if (!el) return;
  el.querySelector(".main").textContent = text;
  el.querySelector(".main").style.display = text ? "" : "none";
  el.querySelector(".sub").textContent = sub;
  el.style.opacity = String(opacity);
}
