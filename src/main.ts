import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createTableView } from "./render/scene";
import { createDebugPanel } from "./game/debugPanel";
import { createGame } from "./game/game";
import { buildDisplayList, lostCourseLines, pathMarkers, railShotOverlays, torpedoOverlays } from "./render/displayList";
import { aimRailgun, railgunBlocked } from "./sim/weapons/railgun";
import { applyLabelStyle } from "./render/labelStyle";
import { createPathLayer } from "./render/paths";
import { createInterceptLayer } from "./render/intercepts";
import { createRangeRingLayer } from "./render/rangeRings";
import { weaponRings } from "./render/weaponRings";
import { createPdcLayer, type PdcDome, type Tracer } from "./render/pdcs";
import { dirToSim } from "./render/frame";
import { pathTuning } from "./data/paths";
import { formatCountdown, formatDistance } from "./ui/format";
import { DT } from "./sim/sim";
import { G0 } from "./data/ships";
import { createOrderInput, type OrderKind, type SalvoSize } from "./game/input";
import { createIconLayer } from "./render/icons";
import { createImpactLayer } from "./render/impacts";
import { impactsFromEvents } from "./render/impactModel";
import { areHostile } from "./sim/world";
import { createBodyLayer } from "./render/bodies";
import { createDropLines } from "./render/dropLines";
import { palette } from "./render/palette";
import { createHolotable } from "./render/holotable";
import { Hud } from "./ui/Hud";
import { SetupScreen } from "./ui/SetupScreen";
import { hudActions, hudStore } from "./ui/store";
import { timeTuning } from "./data/time";
import { defaultScenario, scenarios } from "./data/scenarios";
import { buildSkirmish, parseSkirmish, skirmishMaps } from "./data/skirmish";
import { effectsTuning } from "./data/effects";
import { tuningRoots } from "./data/tuningRoots";
import { audioTuning } from "./data/audio";
import { createSoundSystem } from "./audio/synth";
import { cuesFromEvents, cuesFromSignals, driveLevel } from "./game/soundCues";

// What to play, from the page address: ?skirmish=open-duel&enemies=2&ai=hunter (the setup
// screen's choice), or ?scenario=holotable-test. Neither: the skirmish setup screen, with a
// paused scene behind it.
const params = new URLSearchParams(location.search);
const skirmish = parseSkirmish(params);
const showSetup = !skirmish && !params.has("scenario");
const scenarioName = skirmish ? `skirmish: ${skirmish.map}` : params.get("scenario") ?? defaultScenario;
const game = createGame(
  skirmish
    ? buildSkirmish(skirmish)
    : showSetup
      ? buildSkirmish({ map: skirmishMaps[0].id, enemies: 1, personality: "duelist" })
      : scenarios[scenarioName] ?? scenarios[defaultScenario],
);
if (showSetup) game.paused = true;
const view = createTableView(document.getElementById("table")!);
const sound = createSoundSystem();
createDebugPanel(
  scenarioName,
  () => {
    game.restart();
    impacts.clear();
  },
  sound,
);
createRoot(document.getElementById("hud")!).render(createElement(showSetup ? SetupScreen : Hud));

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
const rangeRings = createRangeRingLayer(view.scene);
const pdcLayer = createPdcLayer(view.scene);
const labelRoot = document.createElement("div");
labelRoot.className = "obj-labels";
view.overlay.appendChild(labelRoot);
const icons = createIconLayer(labelRoot);
const impacts = createImpactLayer(labelRoot);
view.onResize = (w, h) => {
  icons.resize(w, h);
  impacts.resize(w, h);
};
icons.resize(view.dom.clientWidth, view.dom.clientHeight);
impacts.resize(view.dom.clientWidth, view.dom.clientHeight);

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
hudActions.toggleMute = () => {
  audioTuning.muted = !audioTuning.muted;
  sound.applyVolumes();
};
hudActions.setCompression = (i) => game.setCompression(i);
hudActions.restart = () => game.restart();
hudActions.backToSetup = () => {
  location.href = location.pathname;
};
hudActions.startOrder = (kind) => orders.start(kind as OrderKind);
/** The active ship's Sensors switch, counting a switch still waiting for the next tick. */
const sensorsOn = (id: string): boolean => {
  const waiting = game.world.pending.filter((q) => q.command.type === "setSensors" && q.command.ship === id).pop();
  if (waiting && waiting.command.type === "setSensors") return waiting.command.on;
  return game.picture.ownShips.find((s) => s.id === id)?.sensorsOn ?? false;
};
hudActions.toggleSensors = () => {
  const id = game.activeShipId;
  if (id) game.issue({ type: "setSensors", ship: id, on: !sensorsOn(id) });
};
hudActions.setG = (g) => orders.setG(g);
hudActions.setSalvo = (n) => {
  orders.salvo = n as SalvoSize;
};
hudActions.setLaunchMode = (m) => {
  orders.launchMode = m;
};
hudActions.setPdcMode = (mount, mode) => {
  if (game.activeShipId) game.issue({ type: "setPdcs", ship: game.activeShipId, mount, mode });
};
hudActions.setPdcBurst = (b) => {
  if (game.activeShipId) game.issue({ type: "setPdcBurst", ship: game.activeShipId, ...b });
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

const ORDER_KEYS: Record<string, OrderKind> = { b: "burnTo", i: "rendezvous", p: "fastPass", m: "match", k: "stationKeep", o: "orient", r: "orbit", c: "coast", e: "evade", v: "evasive", l: "launch", d: "pdcTarget", g: "railgun" };

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "f" || e.key === "F") focusSelected();
  if (e.key === "t" || e.key === "T") view.cam.toggleTopDown();
  if ((e.key === "w" || e.key === "W") && !e.metaKey && !e.ctrlKey) pathTuning.showOwnRings = !pathTuning.showOwnRings;
  if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey) hudActions.toggleSensors();
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
  if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey) hudActions.toggleMute();
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
let lastRenderTime = game.renderTime;
let firstFrame = true;
let hudTimer = 0;
function frame(now: number) {
  applyLabelStyle();
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
            strain: own.strain,
            efficiency: own.efficiency,
            health: own.health,
            sensorsOn: sensorsOn(own.id),
            emissions: own.sensorsOn ? "SENSORS" : own.thrust > 0 ? "DRIVE" : own.loud ? "VISIBLE" : "DARK",
            heat: own.heat,
            evading: own.evading,
          }
        : null,
      weapons: own
        ? { ...own.torpedoes, salvo: orders.salvo, mode: orders.launchMode }
        : null,
      pdcs: own ? own.pdcs.map((m) => ({ mode: m.mode, firing: m.firing, rounds: m.rounds, roundsMax: m.roundsMax, health: m.health })) : null,
      pdcBurst: own ? own.pdcBurst : null,
      railgun: own ? own.railgun : null,
      railgunDetected: game.alerts.railgunDetected,
      alerts: game.alertList,
      alertLog: game.alertLog,
      slugImpactIn: game.alerts.slugImpactIn,
      launchDetected: game.alerts.launchDetected,
      impactIn: game.alerts.impactIn,
      orderMode: orders.mode,
      hint: orders.hint,
      simTime: game.simTime,
      paused: game.paused,
      compressionIndex: game.compressionIndex,
      compressionSteps: timeTuning.compressionSteps,
      notice: game.notice,
      muted: audioTuning.muted,
      outcome: game.outcome ? { result: game.outcome.result, title: game.outcome.title, detail: game.outcome.detail, timeS: game.outcome.tick * DT } : null,
    });
  }
  view.cam.update(dt);
  holotable.update(view.cam.focus, view.cam.distance, dt, view.cam.camera);
  const preview = orders.preview;
  const torps = torpedoOverlays(game.picture, game.torpedoPaths, game.world.tick, DT);
  const rails = railShotOverlays(game.picture, game.shotPaths, game.world.tick, DT);
  // Aiming the railgun: the lead point on the target under the cursor, with the flight
  // time, or why the shot cannot be made (orange).
  const rgPreview = [];
  const shooter = game.world.ships.find((s) => s.id === game.activeShipId);
  if (orders.mode === "railgun" && shooter && orders.hoverId && orders.hoverId !== shooter.id) {
    const isTrack = game.picture.tracks.some((t) => t.id === orders.hoverId && t.allegiance !== "friendly");
    const isBody = game.picture.bodies.some((b) => b.id === orders.hoverId);
    if (isTrack || isBody) {
      const target = isTrack ? { kind: "track" as const, id: orders.hoverId } : { kind: "object" as const, id: orders.hoverId };
      const aim = aimRailgun(game.world, shooter, target);
      const why = railgunBlocked(game.world, shooter, target);
      if (aim) rgPreview.push({ id: "rg-lead", position: aim.aimPoint, label: why ? why.toUpperCase() : `RG LEAD · ${formatCountdown(aim.t)}`, warn: !!why });
    }
  }
  // Weapon range rings on the plane: our ships' always (W hides them), a selected enemy's,
  // and the torpedo ring brighter while aiming torpedoes. Each big enough ring is labelled
  // to the lower left as seen from the camera (the grid's own ring labels sit lower right,
  // and straight toward us lands under the bottom bar), a little round from the others.
  const rings = weaponRings(game.picture, {
    selectedId: game.selectedId,
    aimingTorpedoesFrom: orders.mode === "launch" ? game.activeShipId : null,
    formatDistance,
    positionOf: (id) => game.positionOf(id),
  });
  const ringLabels = [];
  {
    const c = view.cam.camera.position;
    const toCam = dirToSim(c.x, c.y, c.z);
    const base = Math.atan2(toCam.y, toCam.x) - 0.7;
    const turn = { torpedo: 0, railgun: 0.12, pdc: 0.24 };
    for (const r of rings) {
      if (r.radius < pathTuning.rangeRingLabelMin * view.cam.distance) continue;
      const a = base + turn[r.weapon];
      ringLabels.push({
        id: `range:${r.key}`,
        kind: "range" as const,
        position: { x: r.center.x + Math.cos(a) * r.radius, y: r.center.y + Math.sin(a) * r.radius, z: view.cam.focus.z },
        label: r.label,
        allegiance: r.allegiance,
      });
    }
  }
  const list = buildDisplayList(
    game.picture,
    [...pathMarkers(game.predictions.values(), game.world.tick, DT), ...torps.markers, ...rails.markers, ...ringLabels],
    [...(preview ? [{ id: "placement", position: preview.position, label: preview.label, warn: preview.warn }] : []), ...rgPreview],
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
  intercepts.update([...torps.lines, ...rails.lines], view.cam.focus, view.cam.distance, rails.streaks, lostCourseLines(game.picture, pathTuning.lostCourseS));
  rangeRings.update(rings, view.cam.focus);
  // PDC domes on our ships; tracers from every gun that is firing (theirs are visible too).
  const domes: PdcDome[] = [];
  const tracers: Tracer[] = [];
  const still = { x: 0, y: 0, z: 0 };
  for (const s of game.picture.ownShips) {
    s.pdcs.forEach((m, i) => {
      if (m.health <= 0) return;
      domes.push({ key: `${s.id}:${i}`, center: s.position, direction: m.direction, arc: s.pdcArc, firing: m.firing });
      const to = (m.aimId && game.positionOf(m.aimId)) || m.aimAt?.position;
      if (m.firing && to) tracers.push({ key: `${s.id}:${i}`, from: s.position, fromVelocity: s.velocity, to, toVelocity: m.aimAt?.velocity ?? still, hostile: false });
    });
  }
  for (const t of game.picture.tracks) {
    (t.pdcFire ?? []).forEach((aim, j) =>
      tracers.push({ key: `${t.id}:${j}`, from: t.position, fromVelocity: t.velocity, to: aim.position, toVelocity: aim.velocity, hostile: t.allegiance === "hostile" }),
    );
  }
  // Rounds move on the same smooth clock as the interpolated ships, so a stream does not
  // step at the sim's 20 Hz while the ship it leaves glides.
  pdcLayer.update(domes, tracers, view.cam.focus, Math.max(0, game.renderTime - lastRenderTime));
  lastRenderTime = game.renderTime;
  bodies.update(list.bodies, view.cam.focus);
  dropLines.update(list, view.cam.focus, view.cam.camera, view.dom.clientHeight);
  icons.update(list, view.cam.focus, view.cam.camera, game.selectedId, now / 1000);
  // Explosions, sparks and hit text for what was hit since the last frame, and its sounds.
  const events = game.takeEvents();
  const eventCtx = {
    playerFaction: game.playerFaction,
    hostile: (a: string, b: string) => areHostile(game.world, a, b),
    factionOf: (id: string) => game.factionOf(id),
  };
  const fx = impactsFromEvents(events, eventCtx);
  sound.play([...cuesFromEvents(events, eventCtx), ...cuesFromSignals(game.takeSignals())]);
  {
    const own = game.picture.ownShips.find((s) => s.id === game.activeShipId);
    const { impactIn, slugImpactIn } = game.alerts;
    const soonest = impactIn === null ? slugImpactIn : slugImpactIn === null ? impactIn : Math.min(impactIn, slugImpactIn);
    sound.update(
      {
        drive: own ? driveLevel(own.thrust / G0) : 0,
        pdcsFiring: own ? own.pdcs.filter((m) => m.firing).length : 0,
        impactIn: soonest,
        quiet: game.paused || !!game.outcome,
      },
      dt,
    );
  }
  impacts.spawn(fx.effects, fx.texts);
  impacts.update(dt, view.cam.focus, view.cam.camera, (id) => game.positionOf(id));
  view.render([[icons.scene, icons.camera], [impacts.scene, impacts.camera]]);
  if (firstFrame) {
    firstFrame = false;
    // Signals the screenshot script that the scene has rendered.
    (window as unknown as { __aresReady: boolean }).__aresReady = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for the browser console and inspection scripts (dev builds only).
if (import.meta.env.DEV) (window as unknown as { __ares: unknown }).__ares = { game, view, impacts, sound, tuning: tuningRoots };
