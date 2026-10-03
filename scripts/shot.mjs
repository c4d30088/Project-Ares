// Headless screenshot of the running game: starts a dev server, opens the page
// in headless Chromium, waits for the first rendered frame, saves shots/latest.png.
// Usage: npm run shot [-- --wait 1500 --width 1600 --height 900 --query "top=1&dist=3e6" --out name]
// --query is passed to the page URL (see the URL options in src/main.ts).
import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const width = opt("width", 1600);
const height = opt("height", 900);
const wait = opt("wait", 1000);
const strOpt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const query = strOpt("query", "");
const out = `shots/${strOpt("out", "latest")}.png`;

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(query ? `${url}?${query}` : url);
  await page.waitForFunction(() => window.__aresReady === true, null, { timeout: 20000 });
  await page.waitForTimeout(wait);

  mkdirSync("shots", { recursive: true });
  await page.screenshot({ path: out });
  console.log(`Saved ${out}`);
  if (errors.length) {
    console.error("Page errors:\n" + errors.join("\n"));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
