import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createTableView } from "./render/scene";
import { createDebugPanel } from "./game/debugPanel";
import { createGame } from "./game/game";
import { buildDisplayList } from "./render/displayList";
import { createIconLayer } from "./render/icons";
import { createBodyLayer } from "./render/bodies";
import { createDropLines } from "./render/dropLines";
import { palette } from "./render/palette";
import { createHolotable } from "./render/holotable";
import { Hud } from "./ui/Hud";
import type { Scenario } from "./sim/scenario";
import holotableTest from "./data/scenarios/holotable-test.json";
import { effectsTuning } from "./data/effects";
import { holotableTuning } from "./data/holotable";

const game = createGame(holotableTest as Scenario);
const view = createTableView(document.getElementById("table")!);
createDebugPanel();
createRoot(document.getElementById("hud")!).render(createElement(Hud));

// Palette tokens as CSS variables (--friendly, --chrome, ...) for the HUD and table labels.
for (const [k, v] of Object.entries(palette)) document.documentElement.style.setProperty(`--${k}`, v);

const readout = document.createElement("div");
readout.className = "scale-readout mono";
view.overlay.appendChild(readout);
const holotable = createHolotable(view.scene, readout);
const bodies = createBodyLayer(view.scene);
const dropLines = createDropLines(view.scene);
const labelRoot = document.createElement("div");
labelRoot.className = "obj-labels";
view.overlay.appendChild(labelRoot);
const icons = createIconLayer(labelRoot);
view.onResize = (w, h) => icons.resize(w, h);
icons.resize(view.dom.clientWidth, view.dom.clientHeight);

const focusSelected = (animate = true) => {
  const p = game.selectedId && game.positionOf(game.selectedId);
  if (p) view.cam.setFocus(p, animate);
};
focusSelected(false);

// Click selects the symbol under the cursor (or clears the selection); double-click also focuses.
const toLocal = (x: number, y: number) => {
  const r = view.dom.getBoundingClientRect();
  return [x - r.left, y - r.top] as const;
};
view.cam.onClick = (x, y) => {
  game.selectedId = icons.pick(...toLocal(x, y));
};
view.dom.addEventListener("dblclick", (e) => {
  const id = icons.pick(...toLocal(e.clientX, e.clientY));
  if (id) {
    game.selectedId = id;
    focusSelected();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "f" || e.key === "F") focusSelected();
  if (e.key === "t" || e.key === "T") view.cam.toggleTopDown();
  if (e.key === "Escape") game.selectedId = null;
});

// URL options for screenshots and quick checks: ?yaw=-60&pitch=30&dist=5e6&top=1&focus=<id>
const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
if (q.has("focus")) {
  game.selectedId = q.get("focus");
  focusSelected(false);
}
// Tunable overrides for screenshots: ?fx.bloomStrength=0&h.showRangeSpheres=false
const overridable: Record<string, Record<string, unknown>> = { fx: effectsTuning, h: holotableTuning };
for (const [k, val] of q) {
  const [prefix, key] = k.split(".");
  const target = overridable[prefix];
  if (target && key in target) target[key] = val === "false" ? false : val === "true" ? true : Number(val);
}
view.cam.setView({ yawDeg: num("yaw"), pitchDeg: q.has("top") ? 89.9 : num("pitch"), distance: num("dist") }, false);

let last = performance.now();
let firstFrame = true;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  view.cam.update(dt);
  holotable.update(view.cam.focus, view.cam.distance, dt, view.cam.camera);
  const list = buildDisplayList(game.picture);
  bodies.update(list.bodies, view.cam.focus, view.cam.camera);
  dropLines.update(list, view.cam.focus, view.cam.camera, view.dom.clientHeight);
  icons.update(list, view.cam.focus, view.cam.camera, game.selectedId, now / 1000);
  view.render([[icons.scene, icons.camera]]);
  if (firstFrame) {
    firstFrame = false;
    // Signals the screenshot script that the scene has rendered.
    (window as unknown as { __aresReady: boolean }).__aresReady = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
