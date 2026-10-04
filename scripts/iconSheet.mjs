// Builds the icon review sheet: shots/icon-sheet.html, a self-contained page.
//
// Nothing about the icons is copied by hand. The game's own createSymbolAtlas() runs against
// a recording canvas, and every drawing call it makes is turned into SVG, so the sheet shows
// exactly what the game draws and updates when src/render/symbolAtlas.ts changes. Sizes and
// colors come from src/data/symbols.ts and src/render/palette.ts.
//
// Usage: npm run icons
//        npm run icons -- --standalone   also saves docs/icon-review/icon-sheet.html, a plain
//                                        page for the project (review controls hidden)
// Optional context images: shots/sheet-holotable.png and shots/sheet-firstfight.png
// (made with npm run shot -- --query "scenario=holotable-test&paused=1" --out sheet-holotable).

import { createServer } from "vite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------------------
// 1. Run the game's atlas code against a recording canvas.
// ---------------------------------------------------------------------------------------

const f = (n) => String(Math.round(n * 1e4) / 1e4);

class Recorder {
  constructor() {
    this.cells = new Map(); // atlas cell index -> list of drawing ops
    this.canvas = { width: 0, height: 0, getContext: () => this };
    this.stack = [];
    this.ops = null;
    this.path = [];
    this.pts = [];
    this.reset();
  }
  reset() {
    this.lineWidth = 1;
    this.lineDash = [];
    this.globalAlpha = 1;
    this.globalCompositeOperation = "source-over";
    this.lineCap = "butt";
    this.lineJoin = "miter";
    this.font = "";
    this.textAlign = "start";
    this.textBaseline = "alphabetic";
  }
  snapshot() {
    const { lineWidth, lineDash, globalAlpha, globalCompositeOperation, lineCap, lineJoin, font, textAlign, textBaseline, ops } = this;
    return { lineWidth, lineDash, globalAlpha, globalCompositeOperation, lineCap, lineJoin, font, textAlign, textBaseline, ops };
  }
  save() {
    this.stack.push(this.snapshot());
  }
  restore() {
    Object.assign(this, this.stack.pop());
  }
  // drawCell() translates to the middle of a cell, then scales to symbol units.
  translate(x, y) {
    const cols = this.cols, cell = this.canvas.width / cols;
    const idx = Math.round((y - cell / 2) / cell) * cols + Math.round((x - cell / 2) / cell);
    this.ops = [];
    this.cells.set(idx, this.ops);
  }
  scale() {}
  setLineDash(d) {
    this.lineDash = [...d];
  }
  beginPath() {
    this.path = [];
    this.pts = [];
  }
  bbox() {
    const xs = this.pts.map((p) => p[0]), ys = this.pts.map((p) => p[1]);
    return this.pts.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
  }
  moveTo(x, y) {
    this.path.push(`M${f(x)} ${f(y)}`);
    this.pts.push([x, y]);
  }
  lineTo(x, y) {
    this.path.push(`L${f(x)} ${f(y)}`);
    this.pts.push([x, y]);
  }
  closePath() {
    this.path.push("Z");
  }
  arc(x, y, r, a0, a1, ccw = false) {
    const at = (a) => [x + r * Math.cos(a), y + r * Math.sin(a)];
    const [sx, sy] = at(a0);
    this.path.push(`${this.path.length ? "L" : "M"}${f(sx)} ${f(sy)}`);
    const sweep = ccw ? 0 : 1;
    if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9) {
      const [ox, oy] = at(a0 + Math.PI);
      this.path.push(`A${f(r)} ${f(r)} 0 1 ${sweep} ${f(ox)} ${f(oy)}A${f(r)} ${f(r)} 0 1 ${sweep} ${f(sx)} ${f(sy)}`);
      this.pts.push([x - r, y - r], [x + r, y + r]);
    } else {
      const [ex, ey] = at(a1);
      const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
      this.path.push(`A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(ex)} ${f(ey)}`);
      this.pts.push([sx, sy], [ex, ey]);
    }
  }
  stroke() {
    this.ops.push({
      kind: "stroke", d: this.path.join(""), w: this.lineWidth, dash: this.lineDash,
      cap: this.lineCap, join: this.lineJoin, alpha: this.globalAlpha, comp: this.globalCompositeOperation, bb: this.bbox(),
    });
  }
  fill() {
    this.ops.push({ kind: "fill", d: this.path.join(""), alpha: this.globalAlpha, comp: this.globalCompositeOperation });
  }
  fillText(t, x, y) {
    const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 1);
    this.ops.push({ kind: "text", t, x, y, size, bold: /bold/.test(this.font), comp: this.globalCompositeOperation });
  }
}

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let atlas, palette, tuning;
const rec = new Recorder();
try {
  globalThis.document = { createElement: () => rec.canvas };
  atlas = await server.ssrLoadModule("/src/render/symbolAtlas.ts");
  palette = (await server.ssrLoadModule("/src/render/palette.ts")).palette;
  tuning = (await server.ssrLoadModule("/src/data/symbols.ts")).symbolTuning;
  rec.cols = Math.round(1 / atlas.cellUv(0)[2]);
  atlas.createSymbolAtlas();
} finally {
  await server.close();
}
const { cellIndex, EXTRA_CELLS } = atlas;

// ---------------------------------------------------------------------------------------
// 2. Cells to SVG.
// ---------------------------------------------------------------------------------------

let uid = 0;
const QUAD = 5 / 3; // a cell spans +-5/3 symbol units (symbol radius is 0.3 of the cell)

function drawOp(o, color = "currentColor") {
  if (o.kind === "text") {
    return `<text x="${f(o.x)}" y="${f(o.y)}" font-size="${o.size}" font-weight="${o.bold ? 700 : 400}" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" fill="${color}">${o.t}</text>`;
  }
  if (o.kind === "fill") return `<path d="${o.d}" fill="${color}" fill-opacity="${o.alpha}" stroke="none"/>`;
  const dash = o.dash.length ? ` stroke-dasharray="${o.dash.join(" ")}"` : "";
  return `<path d="${o.d}" fill="none" stroke="${color}" stroke-width="${f(o.w)}" stroke-linejoin="${o.join}" stroke-miterlimit="10" stroke-linecap="${o.cap}"${dash}/>`;
}

// Canvas "destination-out" (used for the ? knocked out of a filled diamond) becomes a mask.
function cellMarkup(index) {
  const ops = rec.cells.get(index);
  if (!ops) throw new Error(`atlas cell ${index} was never drawn`);
  const cut = ops.findIndex((o) => o.comp === "destination-out");
  if (cut < 0) return ops.map((o) => drawOp(o)).join("");
  const id = `m${uid++}`;
  const knock = ops.filter((o) => o.comp === "destination-out");
  return (
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="-2" y="-2" width="4" height="4"><rect x="-2" y="-2" width="4" height="4" fill="#fff"/>${knock.map((o) => drawOp(o, "#000")).join("")}</mask>` +
    `<g mask="url(#${id})">${ops.slice(0, cut).map((o) => drawOp(o)).join("")}</g>` +
    ops.slice(cut).filter((o) => o.comp !== "destination-out").map((o) => drawOp(o)).join("")
  );
}

/** One icon as inline SVG. Size comes from CSS: --q (the quad in game pixels) times --k. */
function icon(cell, q, color, { opacity = 1, cls = "" } = {}) {
  const style = `--q:${q};color:${color}${opacity < 1 ? `;opacity:${opacity}` : ""}`;
  return `<svg class="ico ${cls}" style="${style}" viewBox="${f(-QUAD)} ${f(-QUAD)} ${f(2 * QUAD)} ${f(2 * QUAD)}" aria-hidden="true">${cellMarkup(cell)}</svg>`;
}

/** Icons drawn on top of each other, centered (a ship and its reticle, say). */
function stack(layers, q) {
  return `<span class="stack" style="--q:${q}">${layers.join("")}</span>`;
}

// ---------------------------------------------------------------------------------------
// 3. What each icon is, where it appears, and what to look at.
// ---------------------------------------------------------------------------------------

const P = palette;
const Q = tuning.size;
const px = (n) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");

const ALLEG = {
  friendly: { label: "Friendly", color: P.friendly, treat: "plain" },
  neutral: { label: "Neutral", color: P.neutral, treat: "plain" },
  hostile: { label: "Hostile", color: P.hostile, treat: "brackets" },
  unknown: { label: "Unknown", color: P.uncertainMap, treat: "dashed" },
};

// Symbol and stroke size at game size, measured from what was drawn (hollow, no brackets).
function measure(shape) {
  const strokes = rec.cells.get(cellIndex(shape, false, "plain")).filter((o) => o.kind === "stroke" && o.bb);
  const x0 = Math.min(...strokes.map((o) => o.bb[0])), x1 = Math.max(...strokes.map((o) => o.bb[2]));
  const y0 = Math.min(...strokes.map((o) => o.bb[1])), y1 = Math.max(...strokes.map((o) => o.bb[3]));
  const R = 0.3 * Q[shape] * tuning.scale; // symbol unit radius in game pixels
  return { w: (x1 - x0) * R, h: (y1 - y0) * R, stroke: strokes[0].w * R };
}

const SHIPS = [
  {
    key: "corvette", name: "Corvette", form: "Single chevron",
    used: "Holotable test: CV-2 SPARROW (yours) and TRK-13 (hostile)",
    states: ["friendly", "neutral", "hostile"], rows: ["coast", "burn"],
    note: "Chevron points where the ship is going. Check it reads as a chevron and not a caret or arrow at this size.",
  },
  {
    key: "frigate", name: "Frigate", form: "Triangle wedge",
    used: "Your FF-1 WARDEN in every scenario, and the hostile frigates in the first fight and flight test",
    states: ["friendly", "neutral", "hostile"], rows: ["coast", "burn"],
    note: "The most-seen symbol in the game, since you fly one. The selection reticle sits close around the hostile version.",
  },
  {
    key: "destroyer", name: "Destroyer", form: "Double chevron",
    used: "Holotable test: DD-3 BULWARK (yours). PDC test: TRK-41 (hostile)",
    states: ["friendly", "neutral", "hostile"], rows: ["coast", "burn"],
    note: "Differs from the corvette only by the second chevron. Check the two stay distinct when the ship is small on screen.",
  },
  {
    key: "cruiser", name: "Cruiser", form: "Triple chevron",
    used: "Hostile TRK-11 in the holotable test and TRK-30 in the PDC test",
    states: ["friendly", "neutral", "hostile"], rows: ["coast", "burn"],
    note: "The destroyer's chevrons with a third added, spaced slightly wider. Check two and three stay easy to tell apart at game size.",
  },
  {
    key: "capital", name: "Capital ship", form: "Three chevrons over a bar",
    used: "Hostile TRK-12 in the holotable test",
    states: ["friendly", "neutral", "hostile"], rows: ["coast", "burn"],
    note: "The cruiser's three chevrons with a base bar, drawn wider and flatter so the whole stack fits inside the hostile brackets. Hollow, the lines sit close together: check three chevrons still count at game size.",
  },
  {
    key: "station", name: "Station", form: "Ring hub with three arms and modules",
    used: "TALLOW RELAY (neutral) in the holotable test",
    states: ["friendly", "neutral", "hostile"], rows: ["coast"],
    note: "A hub with three arms, each ending in a module. Chosen from three options in the icon review. Drawn upright, never rotates, never burns, so there is no filled version in play.",
  },
  {
    key: "unknown", name: "Unknown contact", form: "Dashed diamond with a ?",
    used: "The orange contact in the holotable test, and any contact you have not identified yet",
    states: ["unknown"], rows: ["coast", "burn"],
    note: "The ? is knocked out of the fill when the contact is burning. Always orange and dashed, and does not rotate.",
  },
  {
    key: "torpedo", name: "Torpedo", form: "Slim body, pointed nose, tail fins",
    used: "Enemy salvos in the first fight, the holotable test salvo, and anything you launch",
    states: ["friendly", "hostile"], rows: ["coast", "burn"],
    note: "Points the way it flies. Filled while its drive burns, outlined while coasting after a cold launch. Hostile torpedoes use the brighter threat red and pulse, as in the specimen. They never get corner brackets.",
  },
];

function allegianceColor(shape, a) {
  return shape === "torpedo" && a === "hostile" ? P.threat : ALLEG[a].color;
}
function treatmentFor(shape, a) {
  return shape === "torpedo" ? "plain" : ALLEG[a].treat;
}

function shipCard(s) {
  const q = Q[s.key];
  const m = measure(s.key);
  const rowLabel = { coast: "Coasting", burn: "Burning" };
  const head = `<div class="mh"></div>` + s.states.map((a) => `<div class="mh">${ALLEG[a].label}</div>`).join("");
  const body = s.rows
    .map((row) => {
      const cells = s.states
        .map((a) => {
          const cls = s.key === "torpedo" && a === "hostile" ? "pulse" : "";
          return `<div class="mc">${icon(cellIndex(s.key, row === "burn", treatmentFor(s.key, a)), q, allegianceColor(s.key, a), { cls })}</div>`;
        })
        .join("");
      return `<div class="mr">${rowLabel[row]}</div>${cells}`;
    })
    .join("");
  const strip = s.rows
    .flatMap((row) =>
      s.states.map((a) => icon(cellIndex(s.key, row === "burn", treatmentFor(s.key, a)), q, allegianceColor(s.key, a))),
    )
    .join("");
  const spec = [
    ["Quad", `${q} px`],
    ["Symbol", `${px(m.w)} × ${px(m.h)} px`],
    ["Stroke", `${px(m.stroke)} px`],
  ];
  return card({
    id: `ship-${s.key}`,
    title: s.name,
    sub: s.form,
    body: `
      <div class="stage matrix sp" style="--q:${q};--cols:${s.states.length}">${head}${body}</div>
      <div class="gs-row"><span class="lab">At game size</span><div class="stage gs" style="--q:${q}">${strip}</div></div>
      ${specList(spec)}
      <p class="used"><span class="lab">Appears in</span> ${s.used}</p>
      <p class="note">${s.note}</p>`,
  });
}

// ---- Overlay glyphs -------------------------------------------------------------------

const frigateHollow = (a) => cellIndex("frigate", false, treatmentFor("frigate", a));
const frigateFilled = (a) => cellIndex("frigate", true, treatmentFor("frigate", a));
const reticleQ = Math.round(Math.max(34, Math.max(14, Q.frigate * 0.4) * 2.6) * 10) / 10;

function footRing() {
  // Drawn live in 3D by src/render/dropLines.ts, so this one is built by hand from its numbers:
  // a ring of footRingPx radius on the reference plane, joined to the object by a line.
  const r = 5, op = 0.6;
  const obj = (cy, cell, color) =>
    `<svg x="-17" y="${cy - 17}" width="34" height="34" viewBox="${f(-QUAD)} ${f(-QUAD)} ${f(2 * QUAD)} ${f(2 * QUAD)}" style="color:${color}">${cellMarkup(cell)}</svg>`;
  const scene = (above) => {
    const cy = above ? -30 : 30;
    const line = `<line x1="0" y1="${cy}" x2="0" y2="0" stroke="currentColor" stroke-opacity="${op}" stroke-width="1"${above ? "" : ' stroke-dasharray="3 2.4"'}/>`;
    const ring = `<ellipse cx="0" cy="0" rx="${r}" ry="${r * 0.42}" fill="none" stroke="currentColor" stroke-opacity="0.9" stroke-width="1"/>`;
    return `<svg class="raw" style="--w:44;--h:78;color:${P.friendly}" viewBox="-22 -39 44 78" aria-hidden="true">${line}${ring}${obj(cy, frigateHollow("friendly"), P.friendly)}</svg>`;
  };
  const plan = `<svg class="raw" style="--w:20;--h:20;color:${P.friendly}" viewBox="-10 -10 20 20" aria-hidden="true"><circle cx="0" cy="0" r="${r}" fill="none" stroke="currentColor" stroke-opacity="0.9" stroke-width="1"/></svg>`;
  return { above: scene(true), below: scene(false), plan };
}

const OVERLAYS = [
  {
    key: "select", name: "Selection reticle", form: "Four corner brackets",
    q: reticleQ,
    stages: () => [
      { label: "Alone", html: icon(EXTRA_CELLS.select, reticleQ, P.text, { opacity: 0.9 }) },
      { label: "On a friendly frigate", html: stack([icon(frigateHollow("friendly"), Q.frigate, P.friendly), icon(EXTRA_CELLS.select, reticleQ, P.text, { opacity: 0.9 })], reticleQ) },
      { label: "On a hostile frigate", html: stack([icon(frigateHollow("hostile"), Q.frigate, P.hostile), icon(EXTRA_CELLS.select, reticleQ, P.text, { opacity: 0.9 })], reticleQ) },
    ],
    spec: [["Quad", `${px(reticleQ)} px or larger`], ["Color", "text"]],
    used: "Whatever you have selected: ships, torpedoes, bodies",
    note: "Hostile ships already carry corner brackets, so a selected enemy shows two nested sets about 3 px apart. Same idiom, two jobs.",
  },
  {
    key: "body", name: "Body marker", form: "Ring with a center dot",
    q: tuning.bodyMarkerSize,
    stages: () => [{ label: "Chrome", html: icon(EXTRA_CELLS.bodyMarker, tuning.bodyMarkerSize, P.chrome, { opacity: 0.8 }) }],
    spec: [["Quad", `${tuning.bodyMarkerSize} px`], ["Color", "chrome, 80%"]],
    used: "Moons, planets and asteroids too small to see as a sphere (under 7 px radius)",
    note: "Small and quiet on purpose. Asteroids use it the most.",
  },
  {
    key: "flip", name: "Flip marker", form: "Two arrows rotating round a circle",
    q: 22,
    stages: () => [{ label: "Friendly", html: icon(EXTRA_CELLS.flip, 22, P.friendly, { opacity: 0.95 }) }],
    spec: [["Quad", "22 px"], ["Label", "FLIP T-05:19"]],
    used: "Where the ship turns around to brake, on every burn route",
    note: "Reads like a refresh or sync symbol to some people. Does it say \"turn around here\" to you?",
  },
  {
    key: "arrival", name: "Arrival ring", form: "Circle with four ticks pointing in",
    q: 26,
    stages: () => [{ label: "Friendly", html: icon(EXTRA_CELLS.arrival, 26, P.friendly, { opacity: 0.95 }) }],
    spec: [["Quad", "26 px"], ["Label", "ETA 12:43 · 0.3 M/S"]],
    used: "Where a burn route ends",
    note: "The ticks point inward, like a target ring closing on a point.",
  },
  {
    key: "thrust", name: "Thrust line", form: "Short line ahead of the icon",
    q: Q.capital * 1.5,
    stages: () => {
      const burning = (shape, a, label) => {
        const q = Q[shape], tq = q * 1.5, color = allegianceColor(shape, a);
        return { label, html: stack([icon(cellIndex(shape, true, treatmentFor(shape, a)), q, color), icon(EXTRA_CELLS.thrust, tq, color, { opacity: 0.9 })], tq) };
      };
      return [
        burning("frigate", "friendly", "Friendly frigate"),
        burning("frigate", "hostile", "Hostile frigate"),
        burning("cruiser", "friendly", "Friendly cruiser"),
        burning("capital", "friendly", "Friendly capital ship"),
      ];
    },
    spec: [["Quad", "1.5 × the ship's"], ["Stroke", "round caps"]],
    used: "Any ship that is burning, in its own color",
    note: "Drawn forward of the nose, so it can read as part of the ship or as a separate dash.",
  },
  {
    key: "waypoint", name: "Placed point", form: "Small crosshair",
    q: 26,
    stages: () => [
      { label: "Valid", html: icon(EXTRA_CELLS.waypoint, 26, P.friendly) },
      { label: "Warning", html: icon(EXTRA_CELLS.waypoint, 26, P.uncertainMap) },
    ],
    spec: [["Quad", "26 px"], ["Label", "1,200 KM · +40 KM"]],
    used: "A point you are placing for an order. Orange when the nav computer moves it, such as MIN CLEARANCE near a body",
    note: "Has the same arc-and-ticks language as the arrival ring. Check the two do not blur together.",
  },
  {
    key: "impact", name: "Impact mark", form: "Cross with round ends",
    q: 18,
    stages: () => [
      { label: "Ours", html: icon(EXTRA_CELLS.impact, 18, P.fireFriendly, { opacity: 0.95 }) },
      { label: "Theirs", html: icon(EXTRA_CELLS.impact, 18, P.fireHostile, { opacity: 0.95 }) },
    ],
    spec: [["Quad", "18 px"], ["Label", "T-00:42 ×2"]],
    used: "Where torpedoes and railgun slugs are predicted to arrive, with a countdown",
    note: "Green for our fire, yellow for theirs. This is the smallest glyph on the sheet.",
  },
];

function overlayCard(o) {
  const stages = o.stages();
  return card({
    id: `mark-${o.key}`,
    title: o.name,
    sub: o.form,
    body: `
      <div class="stage specimens sp" style="--q:${o.q}">
        ${stages.map((s) => `<figure>${s.html}<figcaption>${s.label}</figcaption></figure>`).join("")}
      </div>
      <div class="gs-row"><span class="lab">At game size</span><div class="stage gs" style="--q:${o.q}">${stages.map((s) => s.html).join("")}</div></div>
      ${specList(o.spec)}
      <p class="used"><span class="lab">Appears in</span> ${o.used}</p>
      <p class="note">${o.note}</p>`,
  });
}

function footCard() {
  const r = footRing();
  return card({
    id: "mark-foot",
    title: "Drop line and foot ring",
    sub: "Vertical line to a small ring on the plane",
    body: `
      <div class="stage specimens sp" style="--q:34">
        <figure>${r.above}<figcaption>Above the plane</figcaption></figure>
        <figure>${r.below}<figcaption>Below the plane</figcaption></figure>
        <figure>${r.plan}<figcaption>Ring, seen from above</figcaption></figure>
      </div>
      <dl class="spec"><div><dt>Ring</dt><dd>5 px radius</dd></div><div><dt>Line</dt><dd>solid above, dashed below</dd></div><div><dt>Color</dt><dd>the object's, 60%</dd></div></dl>
      <p class="used"><span class="lab">Appears in</span> Under every ship, contact, body and placed point</p>
      <p class="note">Drawn live in 3D, so on the table the ring is an ellipse that follows the camera. Built by hand here from its numbers, unlike the others.</p>`,
  });
}

function specList(rows) {
  return `<dl class="spec">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

function card({ id, title, sub, body }) {
  return `
  <article class="card" id="icon-${id}" data-icon="${id}" data-comment-target>
    <div class="card-in">
      <header class="card-head">
        <div><h3>${title}</h3><p class="form">${sub}</p></div>
        <span class="pill" aria-hidden="true"></span>
      </header>
      ${body}
      <footer class="review">
        <div class="verdict" role="group" aria-label="Verdict for ${title}">
          <button type="button" class="vbtn" data-v="keep" aria-pressed="false">Keep</button>
          <button type="button" class="vbtn" data-v="revise" aria-pressed="false">Revise</button>
          <button type="button" class="vbtn" data-v="cut" aria-pressed="false">Cut</button>
        </div>
        <button type="button" class="cbtn" hidden>Comment</button>
      </footer>
    </div>
  </article>`;
}

// ---- Family view ----------------------------------------------------------------------

function family() {
  const order = ["torpedo", "corvette", "station", "frigate", "destroyer", "unknown", "cruiser", "capital"];
  const names = { torpedo: "Torpedo", corvette: "Corvette", station: "Station", frigate: "Frigate", destroyer: "Destroyer", unknown: "Unknown", cruiser: "Cruiser", capital: "Capital" };
  const row = (label, a, filled, cls = "") => {
    const cells = order
      .map((k) => {
        const al = k === "unknown" ? "unknown" : a;
        const fl = k === "station" ? false : filled;
        return `<div class="fc">${icon(cellIndex(k, fl, treatmentFor(k, al)), Q[k], allegianceColor(k, al))}</div>`;
      })
      .join("");
    return `<div class="fr-label">${label}</div>${cells}`;
  };
  const names8 = order.map((k) => `<div class="fn">${names[k]}<span>${Q[k]} px</span></div>`).join("");
  const small = (a, filled) => order.map((k) => icon(cellIndex(k, k === "station" ? false : filled, treatmentFor(k, k === "unknown" ? "unknown" : a)), Q[k], allegianceColor(k, k === "unknown" ? "unknown" : a))).join("");
  return `
  <div class="family">
    <div class="stage fam">
      ${row("Friendly, coasting", "friendly", false)}
      ${row("Friendly, burning", "friendly", true)}
      ${row("Hostile, coasting", "hostile", false)}
      ${row("Hostile, burning", "hostile", true)}
      <div class="fr-label">Class</div>${names8}
    </div>
    <div class="gs-row wide"><span class="lab">At game size</span>
      <div class="stage gs">${small("friendly", false)}<i class="sep"></i>${small("friendly", true)}<i class="sep"></i>${small("hostile", false)}<i class="sep"></i>${small("hostile", true)}</div>
    </div>
  </div>`;
}

// ---- Palette --------------------------------------------------------------------------

const KEY = [
  ["friendly", "Friendly", "Your ships, placed points, flip and arrival markers"],
  ["neutral", "Neutral", "Independent ships and stations"],
  ["hostile", "Hostile", "Enemy ships. Red always means danger"],
  ["threat", "Threat", "Hostile torpedoes, pulsing"],
  ["uncertainMap", "Uncertain", "Unknown contacts and warnings on the table"],
  ["fireFriendly", "Our fire", "Our weapons once fired: impact marks"],
  ["fireHostile", "Their fire", "Enemy weapons once fired: impact marks"],
  ["chrome", "Chrome", "Body markers and panel frames"],
  ["text", "Text", "Selection reticle and labels"],
];
const swatches = KEY.map(
  ([k, name, use]) => `<li><span class="sw" style="background:${P[k]}"></span><div><b>${name}</b> <code>${P[k]}</code><p>${use}</p></div></li>`,
).join("");

// ---- Context images -------------------------------------------------------------------

function shot(file, caption) {
  if (!existsSync(file)) return "";
  const b64 = readFileSync(file).toString("base64");
  return `<figure class="shot"><img src="data:image/png;base64,${b64}" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;
}
const shots =
  shot("shots/sheet-holotable.png", "Holotable test. Capital ship, corvette, destroyer, cruiser and frigates, the unknown contact (orange), the station (white three-armed hub), flip and arrival markers, foot rings, and the selected frigate with its reticle.") +
  shot("shots/sheet-firstfight.png", "First fight, before the shooting starts. Two hostile frigates with their corner brackets, and your selected frigate.");

// ---------------------------------------------------------------------------------------
// 4. The page.
// ---------------------------------------------------------------------------------------

const total = SHIPS.length + OVERLAYS.length + 1;
const strokes = SHIPS.map((s) => ({ name: s.name, w: measure(s.key).stroke })).sort((a, b) => a.w - b.w);
const strokeNote = `Line weight scales with the icon, from ${px(strokes[0].w)} px on the ${strokes[0].name.toLowerCase()} to ${px(strokes.at(-1).w)} px on the ${strokes.at(-1).name.toLowerCase()}. Quads run from ${Math.min(...SHIPS.map((x) => Q[x.key]))} to ${Math.max(...SHIPS.map((x) => Q[x.key]))} px.`;

const html = `<title>Project Ares Icon Sheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@400;600;700&family=Share+Tech+Mono&display=swap">
<style>
/* Layout: one sticky review bar, then sections of chamfered cards, the same cut-corner panels the game's HUD uses.
   Dark only, on purpose: the page is a window onto the holotable and takes its colors from palette.ts. */
:root {
  --bg: ${P.bg};
  --surface: #0A1118;
  --surface-2: #0F1A24;
  --line: color-mix(in srgb, ${P.chrome} 55%, transparent);
  --line-soft: color-mix(in srgb, ${P.chrome} 22%, transparent);
  --text: ${P.text};
  --dim: ${P.textDim};
  --accent: ${P.friendly};
  --keep: #46D977;
  --revise: ${P.uncertain};
  --cut: ${P.chrome};
  --stage: #03060A;
  --grid: color-mix(in srgb, ${P.grid} 45%, transparent);
  --display: "Oxanium", "Segoe UI", system-ui, sans-serif;
  --mono: "Share Tech Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --k: 2.5;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  background: var(--bg);
  color: var(--text);
  font: 400 14px/1.5 var(--display);
  padding-inline: 16px;
  padding-block: 0 72px;
}
.wrap { max-width: 1180px; margin-inline: auto; }
a { color: var(--accent); }

/* Review bar */
.bar {
  position: sticky; top: env(safe-area-inset-top, 0px); z-index: 20;
  margin-inline: -16px; padding: 10px 16px;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line-soft);
}
.bar-in { max-width: 1180px; margin-inline: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
.brand { font-weight: 700; letter-spacing: .16em; text-transform: uppercase; font-size: 12px; margin-right: auto; }
.brand b { color: var(--accent); font-weight: 700; }
.tally { display: flex; gap: 14px; font-family: var(--mono); font-size: 13px; letter-spacing: .04em; text-transform: uppercase; }
.tally span { color: var(--dim); }
.tally b { font-weight: 400; color: var(--text); font-variant-numeric: tabular-nums; }
.tally .k b { color: var(--keep); } .tally .r b { color: var(--revise); }
.toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); cursor: pointer; }
.toggle input { accent-color: var(--accent); width: 16px; height: 16px; }

/* Intro */
.intro { padding-block: 40px 8px; display: grid; gap: 18px; }
.eyebrow, .lab, h2 .count { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--dim); }
h1 { margin: 0; font-size: clamp(28px, 5vw, 44px); line-height: 1.05; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; text-wrap: balance; }
.lede { margin: 0; max-width: 62ch; color: var(--text); font-size: 15px; }
.how { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 10px 28px; margin: 0; padding: 0; list-style: none; max-width: 980px; }
.how li { border-top: 1px solid var(--line); padding-top: 8px; color: var(--dim); font-size: 13px; }
.how b { color: var(--text); font-weight: 600; display: block; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; margin-bottom: 2px; }
#hint { margin: 0; min-height: 1.4em; font-size: 12px; color: var(--revise); }

/* Sections */
section { padding-top: 48px; display: grid; gap: 18px; }
h2 { margin: 0; display: flex; align-items: baseline; gap: 14px; font-size: 18px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
h2::after { content: ""; flex: 1; height: 6px; align-self: center; min-width: 20px;
  background: repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px 6px) bottom / 100% 4px no-repeat, linear-gradient(var(--line), var(--line)) bottom / 100% 1px no-repeat; }
.section-note { margin: -6px 0 0; max-width: 70ch; color: var(--dim); font-size: 13px; }

/* Color key */
.key { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px 24px; margin: 0; padding: 0; list-style: none; }
.key li { display: flex; gap: 12px; align-items: flex-start; }
.sw { flex: none; width: 28px; height: 28px; margin-top: 2px; border: 1px solid var(--line); }
.key b { font-weight: 600; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; }
.key code { font-family: var(--mono); font-size: 12px; color: var(--dim); }
.key p { margin: 0; color: var(--dim); font-size: 12.5px; }

/* Screenshots */
.shots { display: grid; gap: 16px; }
.shot { margin: 0; border: 1px solid var(--line); background: var(--stage); }
.shot img { display: block; width: 100%; height: auto; }
.shot figcaption { padding: 10px 14px; color: var(--dim); font-size: 12.5px; border-top: 1px solid var(--line-soft); }

/* Stage: a patch of holotable */
.stage {
  background-color: var(--stage);
  background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 16px 16px;
  border: 1px solid var(--line-soft);
}
.ico { display: block; overflow: visible; width: calc(var(--q) * var(--k) * 1px); height: calc(var(--q) * var(--k) * 1px); flex: none; }
.glow .ico, .glow .raw { filter: drop-shadow(0 0 1.5px currentColor) drop-shadow(0 0 5px color-mix(in srgb, currentColor 55%, transparent)); }
.raw { display: block; overflow: visible; width: calc(var(--w) * var(--k) * 1px); height: calc(var(--h) * var(--k) * 1px); }
.stack { position: relative; display: block; width: calc(var(--q) * var(--k) * 1px); height: calc(var(--q) * var(--k) * 1px); flex: none; }
.stack .ico { position: absolute; inset: 0; margin: auto; }
.sp { --k: 2.5; }
.gs { --k: 1; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .78; } }
.pulse { animation: pulse .77s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }

/* Cards */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 500px), 1fr)); gap: 20px; }
.card { display: grid; }
.card { --cut-size: 12px; position: relative; background: var(--line); min-width: 0;
  clip-path: polygon(var(--cut-size) 0, 100% 0, 100% calc(100% - var(--cut-size)), calc(100% - var(--cut-size)) 100%, 0 100%, 0 var(--cut-size)); }
.card-in { margin: 1px; background: var(--surface); display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 14px; min-width: 0;
  clip-path: polygon(var(--cut-size) 0, 100% 0, 100% calc(100% - var(--cut-size)), calc(100% - var(--cut-size)) 100%, 0 100%, 0 var(--cut-size)); }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.card h3 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
.form { margin: 2px 0 0; color: var(--dim); font-size: 13px; }
.pill { display: none; font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; padding: 2px 8px; border: 1px solid currentColor; }
.card[data-verdict="keep"] .pill, .card[data-verdict="revise"] .pill, .card[data-verdict="cut"] .pill { display: inline-block; }
.card[data-verdict="keep"] .pill { color: var(--keep); } .card[data-verdict="keep"] .pill::before { content: "Keep"; }
.card[data-verdict="revise"] .pill { color: var(--revise); } .card[data-verdict="revise"] .pill::before { content: "Revise"; }
.card[data-verdict="cut"] .pill { color: var(--cut); } .card[data-verdict="cut"] .pill::before { content: "Cut"; }
.card[data-verdict="cut"] .stage { opacity: .55; }

.matrix { display: grid; grid-template-columns: 74px repeat(var(--cols), minmax(0, 1fr)); }
.matrix > * { min-width: 0; }
.mh, .mr { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); padding: 6px 8px; }
.mh { text-align: center; border-bottom: 1px solid var(--line-soft); }
.mr { display: flex; align-items: center; border-top: 1px solid var(--line-soft); }
.mc { display: grid; place-items: center; min-height: calc(var(--q) * var(--k) * 1px + 28px); border-top: 1px solid var(--line-soft); border-left: 1px solid var(--line-soft); }
.specimens { display: flex; flex-wrap: wrap; justify-content: space-evenly; align-items: flex-end; gap: 14px 10px; padding: 18px 12px 10px; min-height: calc(var(--q) * var(--k) * 1px + 70px); }
.specimens figure { margin: 0; display: grid; justify-items: center; gap: 10px; }
.specimens figcaption { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); text-align: center; }
.gs-row { display: grid; grid-template-columns: 74px 1fr; align-items: center; gap: 10px; }
.gs { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-evenly; gap: 8px 14px; padding: 10px 12px; min-height: calc(var(--q, 36) * 1px + 26px); }
.gs .ico { margin-block: 0; }
.sep { width: 1px; height: 28px; background: var(--line-soft); }
.spec { display: flex; flex-wrap: wrap; gap: 4px 22px; margin: 0; }
.spec div { display: flex; gap: 8px; align-items: baseline; }
.spec dt { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
.spec dd { margin: 0; font-family: var(--mono); font-size: 13px; letter-spacing: .03em; }
.used, .note { margin: 0; font-size: 13px; }
.used { color: var(--text); }
.used .lab { margin-right: 8px; }
.note { color: var(--dim); padding-left: 10px; border-left: 2px solid var(--line); }

.review { margin-top: auto; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
.verdict { display: inline-flex; }
button { font: inherit; }
.vbtn, .cbtn { font-family: var(--display); font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim);
  background: transparent; border: 1px solid var(--line); padding: 7px 14px; min-height: 36px; cursor: pointer; }
.vbtn + .vbtn { margin-left: -1px; }
.vbtn:hover, .cbtn:hover { color: var(--text); border-color: var(--dim); }
.vbtn[aria-pressed="true"][data-v="keep"] { color: var(--bg); background: var(--keep); border-color: var(--keep); }
.vbtn[aria-pressed="true"][data-v="revise"] { color: var(--bg); background: var(--revise); border-color: var(--revise); }
.vbtn[aria-pressed="true"][data-v="cut"] { color: var(--text); background: color-mix(in srgb, var(--cut) 45%, var(--surface)); border-color: var(--cut); }
.cbtn { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.cbtn:hover { color: var(--bg); background: var(--accent); border-color: var(--accent); }
.vbtn:focus-visible, .cbtn:focus-visible, .toggle input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; position: relative; z-index: 1; }

/* Family view */
.fam { display: grid; grid-template-columns: 124px repeat(8, minmax(0, 1fr)); --k: 2.4; overflow-x: auto; }
.fam .fr-label { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); padding: 10px; display: flex; align-items: center; border-top: 1px solid var(--line-soft); }
.fam .fc { display: grid; place-items: center; min-height: calc(50 * var(--k) * 1px + 18px); border-top: 1px solid var(--line-soft); border-left: 1px solid var(--line-soft); }
.fam .fn { display: grid; justify-items: center; padding: 8px 2px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; border-top: 1px solid var(--line-soft); border-left: 1px solid var(--line-soft); }
.fam .fn span { font-family: var(--mono); color: var(--dim); letter-spacing: .04em; }
.family { display: grid; gap: 12px; }
.family .gs-row { grid-template-columns: 74px 1fr; }
.scroll { overflow-x: auto; }

.foot { margin-top: 56px; padding-top: 16px; border-top: 1px solid var(--line-soft); color: var(--dim); font-size: 13px; display: grid; gap: 6px; max-width: 70ch; }
.foot b { color: var(--text); font-weight: 600; }
.foot p { margin: 0; }

@media (max-width: 640px) {
  .sp { --k: 1.5; }
  .fam { --k: 1; min-width: 640px; }
  .matrix { grid-template-columns: 58px repeat(var(--cols), minmax(0, 1fr)); }
  .gs-row { grid-template-columns: 1fr; gap: 4px; }
  .family .gs-row { grid-template-columns: 1fr; }
  .tally { gap: 10px; font-size: 12px; }
}
</style>

<div class="bar"><div class="bar-in">
  <span class="brand"><b>Ares</b> · Icon review</span>
  <div class="tally" aria-live="polite">
    <span class="k">Keep <b id="n-keep">0</b></span>
    <span class="r">Revise <b id="n-revise">0</b></span>
    <span>Cut <b id="n-cut">0</b></span>
    <span>Open <b id="n-open">${total}</b></span>
  </div>
  <label class="toggle"><input type="checkbox" id="glow" checked> Bloom preview</label>
</div></div>

<div class="wrap">
  <div class="intro">
    <p class="eyebrow">Project Ares · Holotable symbology</p>
    <h1>Icon sheet</h1>
    <p class="lede">Every symbol the table draws, ${total} in all, rendered from the game's own drawing code. Mark each one Keep, Revise or Cut, and say what you want changed in a comment on that icon.</p>
    <ol class="how">
      <li><b>Look</b>Large on the left of each card, then at the size the player actually sees. The bloom switch above shows them with and without glow.</li>
      <li><b>Comment</b>Press Comment on a card and describe the change: shape, weight, size, color, meaning. Be as specific or loose as you like.</li>
      <li><b>Verdict</b>Keep, Revise or Cut. It saves for everyone with the page open. Press the same button again to clear it.</li>
    </ol>
    <p id="hint"></p>
  </div>

  <section id="color">
    <h2>Color key</h2>
    <ul class="key">${swatches}</ul>
  </section>

  <section id="game">
    <h2>In the game</h2>
    <p class="section-note">Where these symbols sit on the table. The icons are small and constant in size, so they read against grids, rings and labels rather than on a clean ground.</p>
    <div class="shots">${shots || '<p class="section-note">No screenshots found. Run npm run shot to add them.</p>'}</div>
  </section>

  <section id="ships">
    <h2>Ships and contacts <span class="count">${SHIPS.length} symbols</span></h2>
    <p class="section-note">Allegiance is color plus treatment: plain outline for friendly and neutral, corner brackets for hostile, dashed for unknown. Filled means the drive is burning, hollow means coasting.</p>
    <h3 class="lab" style="margin:6px 0 -6px">The family side by side</h3>
    <p class="section-note" style="margin-top:0">${strokeNote}</p>
    <div class="scroll">${family()}</div>
    <div class="cards">${SHIPS.map(shipCard).join("")}</div>
  </section>

  <section id="markers">
    <h2>Markers and overlays <span class="count">${OVERLAYS.length + 1} symbols</span></h2>
    <p class="section-note">The glyphs that sit on routes, orders, selection and weapon fire. Specimens are enlarged; the strip under each shows true size.</p>
    <div class="cards">${OVERLAYS.map(overlayCard).join("")}${footCard()}</div>
  </section>

  <div class="foot">
    <p><b>Not on this sheet.</b> The HUD buttons are text only today, so there are no HUD icons to review yet. Route lines, range rings, PDC tracers and the holotable frame are line work rather than icons.</p>
    <p>The atlas also draws dashed versions of every ship class that nothing uses today, because only the unknown contact is dashed. They would come into play for stale contacts, and the dashes break up badly on the small chevrons.</p>
    <p>Generated from <code>src/render/symbolAtlas.ts</code>. After revisions, <code>npm run icons</code> rebuilds this sheet.</p>
  </div>
</div>

<script>
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cards = $$(".card[data-icon]");
  const verdicts = new Map();
  const hint = $("#hint");
  let db = null;

  function paint() {
    const n = { keep: 0, revise: 0, cut: 0 };
    for (const c of cards) {
      const v = verdicts.get(c.dataset.icon) || "";
      c.dataset.verdict = v;
      for (const b of $$(".vbtn", c)) b.setAttribute("aria-pressed", String(b.dataset.v === v));
      if (v) n[v]++;
    }
    $("#n-keep").textContent = n.keep;
    $("#n-revise").textContent = n.revise;
    $("#n-cut").textContent = n.cut;
    $("#n-open").textContent = cards.length - n.keep - n.revise - n.cut;
  }
  paint();

  async function setVerdict(id, v) {
    const before = verdicts.get(id) || "";
    const next = before === v ? "" : v;
    if (next) verdicts.set(id, next); else verdicts.delete(id);
    paint();
    if (!db) return;
    try {
      const ref = db.doc("verdicts/" + id);
      if (next) await ref.set({ verdict: next, at: Date.now() }); else await ref.delete();
    } catch (e) {
      if (before) verdicts.set(id, before); else verdicts.delete(id);
      paint();
      hint.textContent = "That verdict could not be saved with your access to this page.";
    }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest(".vbtn");
    if (b) setVerdict(b.closest(".card").dataset.icon, b.dataset.v);
  });

  // Bloom preview. Remembered per browser; the page works without storage.
  const glow = $("#glow");
  const applyGlow = () => document.body.classList.toggle("glow", glow.checked);
  try { if (localStorage.getItem("ares-icons-glow") === "0") glow.checked = false; } catch (e) {}
  applyGlow();
  glow.addEventListener("change", () => {
    applyGlow();
    try { localStorage.setItem("ares-icons-glow", glow.checked ? "1" : "0"); } catch (e) {}
  });

  const use = (name) => (window.claude && window.claude.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));

  use("comments").then((comments) => {
    if (!comments) {
      hint.textContent = "Commenting is not available in this view.";
      return;
    }
    for (const b of $$(".cbtn")) b.hidden = false;
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".cbtn");
      if (!b) return;
      comments.openComposer({ element: b.closest(".card") }).catch(() => {
        hint.textContent = "The comment box could not open. Try comment mode from the toolbar above the page.";
      });
    });
  });

  use("db").then((store) => {
    if (!store) {
      hint.textContent = (hint.textContent ? hint.textContent + " " : "") + "Verdicts are not saved in this view.";
      return;
    }
    db = store;
    db.collection("verdicts").onSnapshot(
      (snap) => {
        verdicts.clear();
        for (const d of snap.docs) {
          const v = d.data() && d.data().verdict;
          if (v === "keep" || v === "revise" || v === "cut") verdicts.set(d.id, v);
        }
        paint();
      },
      () => { hint.textContent = "Saved verdicts could not be loaded."; },
    );
  });
})();
</script>
`;

mkdirSync("shots", { recursive: true });
writeFileSync("shots/icon-sheet.html", html);
console.log(`Saved shots/icon-sheet.html (${Math.round(html.length / 1024)} KB, ${total} icons)`);

// A reference copy for the repo: a normal HTML document, with the controls that only work
// inside the review page (verdicts, comments, the tally) hidden.
if (process.argv.includes("--standalone")) {
  const cut = html.indexOf("</style>") + "</style>".length;
  const intro = "A snapshot of the icon sheet, kept for reference. It shows every symbol as the game draws it. The review version had comment and verdict controls and ran as a claude.ai page.";
  const page = html
    .replace(/<p class="lede">[\s\S]*?<\/p>/, `<p class="lede">${intro}</p>`)
    .slice(0, cut);
  const rest = html
    .replace(/<p class="lede">[\s\S]*?<\/p>/, `<p class="lede">${intro}</p>`)
    .slice(cut);
  const doc =
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<style>[hidden]{display:none!important}body{margin:0}.review,.how,.tally,#hint{display:none!important}</style>\n` +
    `${page}\n</head>\n<body>${rest}</body>\n</html>\n`;
  mkdirSync("docs/icon-review", { recursive: true });
  writeFileSync("docs/icon-review/icon-sheet.html", doc);
  console.log(`Saved docs/icon-review/icon-sheet.html (${Math.round(doc.length / 1024)} KB)`);
}
