import { createElement } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { createTableView } from "./render/scene";
import { createDebugPanel } from "./game/debugPanel";
import { createGame } from "./game/game";
import { createDebugDots } from "./render/debugDots";
import { palette } from "./render/palette";
import { Hud } from "./ui/Hud";
import type { Scenario } from "./sim/scenario";
import holotableTest from "./data/scenarios/holotable-test.json";

const game = createGame(holotableTest as Scenario);
const view = createTableView(document.getElementById("table")!);
createDebugPanel();
createRoot(document.getElementById("hud")!).render(createElement(Hud));

// TEMPORARY placeholder grid (1,000 km squares) until the holotable lands in step 4.
const grid = new THREE.GridHelper(10_000_000, 10, palette.grid, palette.grid);
(grid.material as THREE.LineBasicMaterial).transparent = true;
(grid.material as THREE.LineBasicMaterial).opacity = 0.35;
view.scene.add(grid);
const dots = createDebugDots(view.scene, game.picture);

const focusSelected = (animate = true) => {
  const p = game.selectedId && game.positionOf(game.selectedId);
  if (p) view.cam.setFocus(p, animate);
};
focusSelected(false);

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "f" || e.key === "F") focusSelected();
  if (e.key === "t" || e.key === "T") view.cam.toggleTopDown();
});

// URL options for screenshots and quick checks: ?yaw=-60&pitch=30&dist=5e6&top=1&focus=<id>
const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
if (q.has("focus")) {
  game.selectedId = q.get("focus");
  focusSelected(false);
}
view.cam.setView({ yawDeg: num("yaw"), pitchDeg: q.has("top") ? 89.9 : num("pitch"), distance: num("dist") }, false);

let last = performance.now();
let firstFrame = true;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  view.cam.update(dt);
  dots.update(view.cam.focus);
  view.render(0);
  if (firstFrame) {
    firstFrame = false;
    // Signals the screenshot script that the scene has rendered.
    (window as unknown as { __aresReady: boolean }).__aresReady = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
