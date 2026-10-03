import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createTableView } from "./render/scene";
import { createDebugPanel } from "./game/debugPanel";
import { createGame } from "./game/game";
import { buildDisplayList, pathMarkers, torpedoOverlays } from "./render/displayList";
import { createPathLayer } from "./render/paths";
import { createInterceptLayer } from "./render/intercepts";
import { DT } from "./sim/sim";
import { G0 } from "./data/ships";
import { createOrderInput, type OrderKind, type SalvoSize } from "./game/input";
import { createIconLayer } from "./render/icons";
import { createBodyLayer } from "./render/bodies";
import { createDropLines } from "./render/dropLines";
import { palette } from "./render/palette";
import { createHolotable } from "./render/holotable";
import { Hud } from "./ui/Hud";
import { hudActions, hudStore } from "./ui/store";
import { timeTuning } from "./data/time";
import { defaultScenario, scenarios } from "./data/scenarios";
import { effectsTuning } from "./data/effects";

// Scenario from the URL (?scenario=holotable-test), else the default.
const scenarioName = new URLSearchParams(location.search).get("scenario") ?? defaultScenario;
const game = createGame(scenarios[scenarioName] ?? scenarios[defaultScenario]);
const view = createTableView(document.getElementById("table")!);
createDebugPanel(scenarioName);
createRoot(document.getElementById("hud")!).render(createElement(Hud));

// Palette tokens as CSS variables (--friendly, --chrome, ...) for the HUD and table labels.
for (const [k, v] of Object.entries(palette)) document.documentElement.style.setProperty(`--${k}`, v);

const readout = document.createElement("div");
readout.className = "scale-readout mono";
view.overlay.appendChild(readout);
const holotable = createHolotable(view.scene, readout);
const bodies = createBodyLayer(view.scene);
const dropLines = createDropLines(view.scene);
const paths = createPathLayer(view.scene);
const intercepts = createInterceptLayer(view.scene);
const labelRoot = document.createElement("div");
labelRoot.className = "obj-labels";
view.overlay.appendChild(labelRoot);
const icons = createIconLayer(labelRoot);
view.onResize = (w, h) => icons.resize(w, h);
icons.resize(view.dom.clientWidth, view.dom.clientHeight);

// The camera follows the focused object until the player pans away.
let followId: string | null = null;
const focusSelected = (animate = true) => {
  const p = game.selectedId && game.positionOf(game.selectedId);
  if (!p) return;
  view.cam.setFocus(p, animate);
  followId = game.selectedId;
};
view.cam.onPan = () => {
  followId = null;
};
focusSelected(false);

const orders = createOrderInput(game, view, (x, y) => icons.pick(x, y));

hudActions.togglePause = () => game.togglePause();
hudActions.setCompression = (i) => game.setCompression(i);
hudActions.startOrder = (kind) => orders.start(kind as OrderKind);
hudActions.setG = (g) => orders.setG(g);
hudActions.setSalvo = (n) => {
  orders.salvo = n as SalvoSize;
};
hudActions.setLaunchMode = (m) => {
  orders.launchMode = m;
};

const isOwnShip = (id: string | null) => !!id && game.picture.ownShips.some((s) => s.id === id);
const select = (id: string | null) => {
  game.selectedId = id;
  if (isOwnShip(id)) game.activeShipId = id;
};

// Click selects the symbol under the cursor (or clears the selection); double-click also focuses.
const toLocal = (x: number, y: number) => {
  const r = view.dom.getBoundingClientRect();
  return [x - r.left, y - r.top] as const;
};
view.cam.onClick = (x, y) => {
  if (!orders.mode) select(icons.pick(...toLocal(x, y)));
};
view.dom.addEventListener("dblclick", (e) => {
  if (orders.mode) return;
  const id = icons.pick(...toLocal(e.clientX, e.clientY));
  if (id) {
    select(id);
    focusSelected();
  }
});

const ORDER_KEYS: Record<string, OrderKind> = { b: "burnTo", i: "rendezvous", p: "fastPass", m: "match", k: "stationKeep", o: "orient", r: "orbit", c: "coast", l: "launch" };

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "f" || e.key === "F") focusSelected();
  if (e.key === "t" || e.key === "T") view.cam.toggleTopDown();
  if (e.key === "Escape") {
    if (orders.mode) orders.cancel();
    else game.selectedId = null;
  }
  const order = ORDER_KEYS[e.key.toLowerCase()];
  if (order && !e.metaKey && !e.ctrlKey) orders.start(order);
  if (e.key === "1") orders.setG("cruise");
  if (e.key === "2") orders.setG("combat");
  if (e.key === "3") orders.setG("max");
  if (e.key === " ") {
    e.preventDefault();
    game.togglePause();
  }
  if (e.key === "[") game.setCompression(game.compressionIndex - 1);
  if (e.key === "]") game.setCompression(game.compressionIndex + 1);
});

// URL options for screenshots and quick checks: ?yaw=-60&pitch=30&dist=5e6&top=1&focus=<id>
const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
if (q.has("focus")) {
  game.selectedId = q.get("focus");
  focusSelected(false);
}
// Effect overrides for screenshots: ?fx.bloomStrength=0&fx.dustOpacity=0
for (const [k, val] of q) {
  const key = k.startsWith("fx.") ? (k.slice(3) as keyof typeof effectsTuning) : null;
  if (key && key in effectsTuning) (effectsTuning as Record<string, number | boolean>)[key] = val === "false" ? false : Number(val);
}
view.cam.setView({ yawDeg: num("yaw"), pitchDeg: q.has("top") ? 89.9 : num("pitch"), distance: num("dist") }, false);

// Paused start for screenshots: ?paused=1
if (q.has("paused")) game.paused = true;

let last = performance.now();
let firstFrame = true;
let hudTimer = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  orders.update();
  if (followId) {
    const p = game.positionOf(followId);
    if (p) view.cam.setAnchor(p);
  }
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    const own = game.picture.ownShips.find((s) => s.id === game.activeShipId);
    const pred = own ? game.predictions.get(own.id) : undefined;
    const elapsed = pred ? (game.world.tick - pred.startTick) * DT : 0;
    hudStore.set({
      activeShip: own
        ? {
            name: own.name,
            shipClass: own.shipClass.toUpperCase(),
            order: own.orderType ?? "coast",
            phase: own.phase,
            speed: Math.hypot(own.velocity.x, own.velocity.y, own.velocity.z),
            accelG: own.thrust / G0,
            g: own.g,
            flipIn: pred?.flip && pred.flip.t > elapsed ? pred.flip.t - elapsed : null,
            eta: pred?.arrival ? Math.max(0, pred.arrival.t - elapsed) : null,
            orbitAlt: own.orbit ? own.orbit.radius - own.orbit.bodyRadius : null,
            orbitPeriod: own.orbit ? own.orbit.period : null,
          }
        : null,
      weapons: own
        ? { ...own.torpedoes, salvo: orders.salvo, mode: orders.launchMode }
        : null,
      launchDetected: game.alerts.launchDetected,
      impactIn: game.alerts.impactIn,
      orderMode: orders.mode,
      hint: orders.hint,
      simTime: game.simTime,
      paused: game.paused,
      compressionIndex: game.compressionIndex,
      compressionSteps: timeTuning.compressionSteps,
      notice: game.notice,
    });
  }
  view.cam.update(dt);
  holotable.update(view.cam.focus, view.cam.distance, dt, view.cam.camera);
  const preview = orders.preview;
  const torps = torpedoOverlays(game.picture, game.torpedoPaths, game.world.tick, DT);
  const list = buildDisplayList(
    game.picture,
    [...pathMarkers(game.predictions.values(), game.world.tick, DT), ...torps.markers],
    preview ? [{ id: "placement", position: preview.position, label: preview.label, warn: preview.warn }] : [],
  );
  paths.update(
    game.predictions,
    (id) => game.positionOf(id),
    game.world.tick,
    DT,
    view.cam.focus,
    view.cam.distance,
    dt,
    game.picture.ownShips.flatMap((s) => (s.orbit ? [{ id: s.id, ...s.orbit }] : [])),
  );
  intercepts.update(torps.lines, view.cam.focus, view.cam.distance);
  bodies.update(list.bodies, view.cam.focus);
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

// Debug handle for the browser console and inspection scripts (dev builds only).
if (import.meta.env.DEV) (window as unknown as { __ares: unknown }).__ares = { game, view };
