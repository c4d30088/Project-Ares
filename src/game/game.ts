// Game state outside the sim: the world, time control, the player's sensor picture
// (interpolated for smooth rendering), selection, and the player's command channel.

import { timeTuning } from "../data/time";
import { pathTuning } from "../data/paths";
import { Predictor, type Prediction } from "../sim/predict";
import type { Command, SimEvent } from "../sim/commands";
import { evaluateOutcome, type Outcome } from "../sim/outcome";
import { loadScenario, type Scenario } from "../sim/scenario";
import { buildPicture, type SensorPicture } from "../sim/sensors/picture";
import { sensorTuning } from "../data/sensors";
import { DT, step, submit, TICK_RATE } from "../sim/sim";
import type { Vec3 } from "../sim/vec3";
import { areHostile, type World } from "../sim/world";
import { predictImpact } from "../sim/weapons/torpedo";
import { pathClosest, predictSlugPath } from "../sim/weapons/railgun";
import { railgunTuning } from "../data/weapons";
import { crewTuning } from "../data/crew";
import { TorpedoPredictor, type TorpedoPath } from "../sim/weapons/torpedoPredict";
import { appendDraft, draftsFromEvents, type LogContext, type LogDraft, type LogEntry } from "./alertLog";

/** Never run more than this many ticks in one frame, whatever the compression. */
const MAX_TICKS_PER_FRAME = 4000;
/** Frames in a row over the sim budget before compression steps down. */
const OVERLOAD_FRAMES = 3;
const NOTICE_SECONDS = 4;

export interface Game {
  world: World;
  playerFaction: string;
  /** The player's picture, with positions interpolated between the last two ticks. */
  picture: SensorPicture;
  selectedId: string | null;
  /** The player's ship that receives orders: the last own ship selected. */
  activeShipId: string | null;
  paused: boolean;
  /** How the fight ended (win, loss or draw), or null while it goes on. Time stops when it is set. */
  outcome: Outcome | null;
  compressionIndex: number;
  /** Short message explaining an automatic time change, or null. */
  notice: string | null;
  /** Latest predicted path for each of the player's ships with a movement order. */
  predictions: Map<string, Prediction>;
  /** Ghost-run path of each torpedo in flight (both sides), for the intercept lines. */
  torpedoPaths: Map<string, TorpedoPath>;
  /** Alerts for the top strip, from the player's picture. impactIn: seconds until the
   *  soonest hostile torpedo reaches one of our ships. */
  alerts: { launchDetected: boolean; impactIn: number | null; railgunDetected: boolean; slugImpactIn: number | null };
  /** The alert strip, most urgent first. */
  alertList: Alert[];
  /** Everything that has happened this fight, oldest first (the alert log). Replaced, never edited. */
  alertLog: LogEntry[];
  /** Railgun shots in the picture with their predicted paths (from the shot) and, for an
   *  enemy shot, where it passes close to one of our ships. */
  shotPaths: Map<string, ShotPath>;
  readonly simTime: number;
  /** Sim seconds as the interpolated picture shows them: smooth between ticks. Effects that
   *  move with the picture (tracer rounds) advance by changes in this. */
  readonly renderTime: number;
  readonly compression: number;
  positionOf(id: string): Vec3 | null;
  /** Which side a ship is on, including one that has just been destroyed. */
  factionOf(id: string): string | undefined;
  /** Every sim event since the last call (the table's effects and the alert log read these). */
  takeEvents(): SimEvent[];
  /** Submits a command as the player's faction. */
  issue(command: Command): void;
  setCompression(index: number): void;
  togglePause(): void;
  /** Starts the scenario again from the beginning (tuning in the debug panel is kept). */
  restart(): void;
  /** Advances the sim by real seconds (scaled by compression) and rebuilds the picture. */
  update(realDt: number): void;
}

export interface Alert {
  text: string;
  /** threat: danger (red); warn: warning (amber); good: the fight is won. */
  tone: "threat" | "warn" | "good";
  /** Blinks while new. */
  blink?: boolean;
  /** Seconds to impact, for the countdown alerts (the HUD formats them). */
  countdown?: number;
}

export interface ShotPath {
  /** Predicted from the shot; t in seconds after it was fired. */
  points: { t: number; position: Vec3 }[];
  /** Enemy shots: where and in how many seconds it passes within the danger radius of one
   *  of our ships (assumed coasting), if it does. */
  danger: { position: Vec3; t: number; shipId: string } | null;
}

export function createGame(scenario: Scenario): Game {
  let world = loadScenario(scenario);
  // For win and loss (sim/outcome.ts): hostile ships at the start, and how many have escaped since.
  let hostileAtStart = 0;
  let hostileEscaped = 0;
  const countHostiles = () => world.ships.filter((s) => areHostile(world, scenario.playerFaction, s.faction)).length;
  const faction = scenario.playerFaction;

  // Positions before the most recent tick, for interpolation.
  const prev = new Map<string, Vec3>();
  // Which side each ship is on, remembered while it is alive (it is gone by the time its
  // destruction is reported).
  const shipFaction = new Map<string, string>();
  const shipNames = new Map<string, string>();
  // Events since the last takeEvents(), capped so an ignored queue cannot grow forever.
  let eventQueue: SimEvent[] = [];
  const EVENT_QUEUE_MAX = 20000;
  const snapshotPrev = () => {
    for (const s of world.ships) {
      shipFaction.set(s.id, s.faction);
      shipNames.set(s.id, s.name);
    }
    for (const list of [world.ships, world.torpedoes, world.stations]) {
      for (const e of list) {
        const p = prev.get(e.id);
        if (p) {
          p.x = e.position.x;
          p.y = e.position.y;
          p.z = e.position.z;
        } else prev.set(e.id, { ...e.position });
      }
    }
  };
  snapshotPrev();

  let accumulator = 0; // fractional ticks
  let overloadFrames = 0;
  let noticeUntil = 0;
  let realClock = 0;

  const isOwn = (shipId: string) => world.ships.some((s) => s.id === shipId && s.faction === faction);
  /** Our side sees this ship or torpedo right now (M4 Sensors Lite). */
  const sideSees = (id: string) => !!world.perfectInfo || (world.sensors[faction]?.[id]?.seenBy.length ?? 0) > 0;
  const shipName = (shipId: string) => world.ships.find((s) => s.id === shipId)?.name ?? shipId;

  // The alert log (see alertLog.ts). Times are sim time.
  let nextLogId = 1;
  const nowT = () => world.tick * DT;
  function logLine(d: LogDraft) {
    game.alertLog = appendDraft(game.alertLog, d, nowT(), () => nextLogId++);
  }
  const logContext: LogContext = {
    playerFaction: faction,
    hostile: (a, b) => areHostile(world, a, b),
    factionOf: (id) => shipFaction.get(id),
    nameOf: (id) => shipNames.get(id) ?? id,
  };
  // Where each of our ships is on the G-strain scale: 0 fine, 1 above the warning, 2 at the limit.
  const strainBand = new Map<string, number>();

  function setNotice(text: string) {
    game.notice = text;
    noticeUntil = realClock + NOTICE_SECONDS;
  }

  // When our ships last took a hit or crew losses (real clock), for the alert strip.
  let lastHullHit = -Infinity;
  let lastCasualties = -Infinity;

  // Hostile torpedoes already warned about for coming inside the threat window.
  const threatWarned = new Set<string>();

  /** Auto-slowdown (DESIGN.md section 5). Returns true if time was slowed. */
  function checkSlowdown(events: SimEvent[]): boolean {
    const slow = (text: string) => {
      if (game.compressionIndex === 0) return false;
      game.compressionIndex = 0;
      setNotice(`1x: ${text}`);
      return true;
    };
    // Only what our side sees: a launch or a shot from a ship hidden from us goes unnoticed.
    for (const e of events) {
      if (e.type === "torpedoLaunched" && timeTuning.slowOnLaunch && areHostile(world, faction, e.faction) && sideSees(e.torpedo) && slow("LAUNCH DETECTED")) return true;
      if (e.type === "railgunFired" && timeTuning.slowOnRailgun && areHostile(world, faction, e.faction) && sideSees(e.ship) && slow("RAILGUN FIRE DETECTED")) return true;
    }
    if (timeTuning.slowOnContact && newContact) {
      const name = newContact;
      newContact = null;
      if (slow(`CONTACT ${name}`)) return true;
    }
    // Our ships hurt: remember it for the alert strip, and slow down.
    for (const e of events) {
      if (e.type === "damage" && isOwn(e.ship)) {
        lastHullHit = realClock; // every hit takes hull
        if (timeTuning.slowOnDamage && slow(`${shipName(e.ship)} HIT`)) return true;
      }
      if (e.type === "crewCasualties" && isOwn(e.ship)) lastCasualties = realClock;
    }
    if (timeTuning.slowOnThreatS > 0) {
      for (const t of world.torpedoes) {
        if (threatWarned.has(t.id) || !areHostile(world, faction, t.faction) || !sideSees(t.id)) continue;
        const hit = predictImpact(world, t);
        if (!hit || hit.t > timeTuning.slowOnThreatS || !hit.targetId || !isOwn(hit.targetId)) continue;
        threatWarned.add(t.id);
        if (slow(`IMPACT T-${Math.ceil(hit.t)} S`)) return true;
      }
    }
    for (const e of events) {
      if (e.type === "flipStart" && timeTuning.slowOnFlip && isOwn(e.ship)) {
        if (game.compressionIndex > 0) {
          game.compressionIndex = 0;
          setNotice(`1x: ${shipName(e.ship)} FLIP`);
          return true;
        }
      }
      if (e.type === "orderComplete" && timeTuning.slowOnOrderComplete && isOwn(e.ship)) {
        if (game.compressionIndex > 0) {
          game.compressionIndex = 0;
          setNotice(`1x: ${shipName(e.ship)} ORDER COMPLETE`);
          return true;
        }
      }
    }
    return false;
  }

  // Predictions: one running predictor per ship, restarted when the order changes (including
  // a command still waiting for the next tick, so routes appear even while paused) or the
  // refresh interval passes. The last finished result stays on screen meanwhile.
  const movementOrders = new Set(["burnTo", "intercept", "matchVelocity", "stationKeep", "orbit"]);
  const movementCommands = new Set(["burnTo", "intercept", "matchVelocity", "stationKeep", "orbit"]);
  const runs = new Map<string, { predictor: Predictor; orderKey: string; startedAt: number; fresh: boolean }>();
  function updatePredictions() {
    const wanted = new Map<string, string>(); // ship id -> order key
    for (const s of world.ships) {
      if (s.faction !== faction) continue;
      const pending = world.pending.filter((q) => q.command.ship === s.id);
      const last = pending[pending.length - 1]?.command;
      // An established orbit is drawn as a ring, not predicted.
      const inOrbit = s.order?.type === "orbit" && s.nav.orbitStage === "orbit";
      const moving = last && last.type !== "setG" ? movementCommands.has(last.type) : !!s.order && movementOrders.has(s.order.type) && !inOrbit;
      if (moving) wanted.set(s.id, JSON.stringify(s.order) + s.g + JSON.stringify(pending.map((q) => q.command)));
    }
    for (const id of [...runs.keys()]) {
      if (!wanted.has(id)) {
        runs.delete(id);
        game.predictions.delete(id);
      }
    }
    for (const [id, key] of wanted) {
      const run = runs.get(id);
      const changed = !run || run.orderKey !== key;
      const stale = changed || (run.predictor.result.done && realClock - run.startedAt > pathTuning.refreshS);
      if (stale) {
        if (changed) game.predictions.delete(id);
        runs.set(id, { predictor: new Predictor(world, id, pathTuning.maxPredictS), orderKey: key, startedAt: realClock, fresh: changed });
      }
    }
    const start = performance.now();
    for (const [id, run] of runs) {
      // A brand-new order gets a bigger budget so its route appears quickly.
      const budget = run.fresh ? pathTuning.freshBudgetMs : pathTuning.budgetMs;
      while (!run.predictor.result.done && performance.now() - start < budget) run.predictor.run(400);
      const r = run.predictor.result;
      if (r.done) run.fresh = false;
      // Already there (station-keep holding): nothing to draw.
      if (r.done && r.arrival && r.arrival.t <= 2 * DT) {
        game.predictions.delete(id);
        continue;
      }
      // Show a finished prediction, or the first one while it is still being computed.
      if (r.done || !game.predictions.has(id)) game.predictions.set(id, r);
    }
  }

  // Torpedo paths: one ghost run per torpedo in flight, re-run every second so they follow
  // targets that change course. The last finished path stays on screen meanwhile.
  const torpedoRuns = new Map<string, { predictor: TorpedoPredictor; startedAt: number }>();
  function updateTorpedoPaths() {
    // Ours, and the enemy's that we see now: a hidden torpedo's path is not ours to know.
    const flying = new Set(
      world.torpedoes.filter((t) => t.guidance && t.guidance.stage !== "search" && (t.faction === faction || sideSees(t.id))).map((t) => t.id),
    );
    for (const id of [...torpedoRuns.keys()]) {
      if (!flying.has(id)) {
        torpedoRuns.delete(id);
        game.torpedoPaths.delete(id);
      }
    }
    for (const id of flying) {
      const run = torpedoRuns.get(id);
      if (!run || (run.predictor.result.done && realClock - run.startedAt > pathTuning.torpedoRefreshS)) {
        torpedoRuns.set(id, { predictor: new TorpedoPredictor(world, id, pathTuning.torpedoMaxPredictS), startedAt: realClock });
      }
    }
    const start = performance.now();
    for (const [id, run] of torpedoRuns) {
      while (!run.predictor.result.done && performance.now() - start < pathTuning.torpedoBudgetMs) run.predictor.run(400);
      if (run.predictor.result.done) game.torpedoPaths.set(id, run.predictor.result);
    }
  }

  /** Where a ghost run is finished, its end is the impact the table shows. */
  function applyTorpedoPaths() {
    for (const tr of game.picture.tracks) {
      const path = tr.kind === "torpedo" && !tr.lost ? game.torpedoPaths.get(tr.id) : undefined;
      if (!path?.end) continue;
      const elapsed = (world.tick - path.startTick) * DT;
      tr.impact = path.end.kind === "miss" ? undefined : { position: path.end.position, t: Math.max(0, path.end.t - elapsed), targetId: tr.impact?.targetId ?? null };
    }
  }

  /** Predicted paths for the shots in the picture (each predicted once, from its shot),
   *  and, for enemy shots, the danger point near one of our ships. */
  function updateShotPaths() {
    const live = new Set(game.picture.shots.map((s) => s.id));
    for (const id of [...game.shotPaths.keys()]) if (!live.has(id)) game.shotPaths.delete(id);
    for (const shot of game.picture.shots) {
      let sp = game.shotPaths.get(shot.id);
      if (!sp) {
        sp = { points: predictSlugPath(world.bodies, shot.origin, shot.velocity, railgunTuning.slugMaxLifeS).points, danger: null };
        game.shotPaths.set(shot.id, sp);
      }
      sp.danger = null;
      if (shot.allegiance !== "hostile") continue;
      const elapsed = (world.tick - shot.tick) * DT;
      const ahead = sp.points.filter((p) => p.t >= elapsed).map((p) => ({ t: p.t - elapsed, position: p.position }));
      if (ahead.length < 2) continue;
      for (const s of game.picture.ownShips) {
        const c = pathClosest(ahead, s.position, s.velocity);
        if (c.dist <= railgunTuning.dangerRadius && (!sp.danger || c.t < sp.danger.t)) sp.danger = { position: c.position, t: c.t, shipId: s.id };
      }
    }
  }

  // Alerts read the player's picture (CLAUDE.md rule 6): a hostile torpedo track not seen
  // before is a detected launch; a hostile railgun shot not seen before is detected fire.
  const knownHostileShots = new Set<string>();
  let railgunAlertUntil = -Infinity;
  const knownHostileTorpedoes = new Set<string>();
  let launchAlertUntil = -Infinity;
  let alertsPrimed = false;
  // Enemy ships our side sees now, and whether any of them runs its sensors (M4 Sensors Lite).
  const liveContacts = new Set<string>();
  let newContact: string | null = null;
  let enemySensorsActive = false;
  function updateContacts() {
    if (world.perfectInfo) return;
    let sensing = false;
    const now = new Set<string>();
    const recs = world.sensors[faction] ?? {};
    for (const r of Object.values(recs)) {
      if (r.kind !== "ship" || !r.seenBy.length || !areHostile(world, faction, r.faction)) continue;
      now.add(r.id);
      if (r.sensorsOn) sensing = true;
      if (!liveContacts.has(r.id) && alertsPrimed) {
        logLine({ tone: "threat", tpl: `CONTACT: ${r.name}` });
        newContact = r.name;
      }
    }
    for (const id of liveContacts) {
      // Gone from the records means seen destroyed or getting away: logged on its own.
      if (!now.has(id) && recs[id]) logLine({ tone: "warn", tpl: `CONTACT LOST: ${recs[id].name}` });
    }
    if (sensing && !enemySensorsActive && alertsPrimed) logLine({ tone: "warn", tpl: "ENEMY SENSORS ACTIVE" });
    enemySensorsActive = sensing;
    liveContacts.clear();
    for (const id of now) liveContacts.add(id);
  }
  function updateAlerts() {
    const own = new Set(game.picture.ownShips.map((s) => s.id));
    let impactIn: number | null = null;
    for (const t of game.picture.tracks) {
      if (t.kind !== "torpedo" || t.allegiance !== "hostile") continue;
      if (!knownHostileTorpedoes.has(t.id)) {
        knownHostileTorpedoes.add(t.id);
        // Torpedoes already flying when the scenario starts are not launches.
        if (alertsPrimed) {
          launchAlertUntil = realClock + timeTuning.launchAlertS;
          logLine({ tone: "threat", key: "launch:hostile", tpl: "LAUNCH DETECTED: {n} {TORPEDO|TORPEDOES}" });
        }
      }
      if (t.impact?.targetId && own.has(t.impact.targetId)) impactIn = Math.min(impactIn ?? Infinity, t.impact.t);
    }
    let slugImpactIn: number | null = null;
    for (const shot of game.picture.shots) {
      if (shot.allegiance !== "hostile") continue;
      if (!knownHostileShots.has(shot.id)) {
        knownHostileShots.add(shot.id);
        if (alertsPrimed) {
          railgunAlertUntil = realClock + timeTuning.launchAlertS;
          logLine({ tone: "threat", key: "rg:hostile", tpl: "RAILGUN FIRE DETECTED: {n} {SHOT|SHOTS}" });
        }
      }
      const d = game.shotPaths.get(shot.id)?.danger;
      if (d) slugImpactIn = Math.min(slugImpactIn ?? Infinity, d.t);
    }
    alertsPrimed = true;
    game.alerts = { launchDetected: realClock < launchAlertUntil, impactIn, railgunDetected: realClock < railgunAlertUntil, slugImpactIn };

    // The strip, most urgent first. Our own ship's state is ours to know.
    const list: Alert[] = [];
    const ship = world.ships.find((s) => s.id === game.activeShipId && s.faction === faction);
    if (impactIn !== null) list.push({ text: "IMPACT", tone: "threat", countdown: impactIn });
    if (slugImpactIn !== null) list.push({ text: "SLUG", tone: "threat", countdown: slugImpactIn });
    // Something inbound: suggest the corkscrew (never automatic).
    if ((impactIn !== null || slugImpactIn !== null) && ship && ship.order?.type !== "evasive") list.push({ text: "EVASIVE MANEUVERS: V", tone: "warn" });
    if (ship) {
      const recentHit = realClock - lastHullHit < timeTuning.damageAlertS;
      if (recentHit || ship.health.hull < timeTuning.hullAlert) list.push({ text: `HULL BREACH ${Math.round(ship.health.hull * 100)}%`, tone: "threat", blink: recentHit });
      if (realClock - lastCasualties < timeTuning.damageAlertS) list.push({ text: "CREW CASUALTIES", tone: "threat", blink: true });
    }
    if (game.alerts.launchDetected) list.push({ text: "LAUNCH DETECTED", tone: "threat", blink: true });
    if (game.alerts.railgunDetected) list.push({ text: "RAILGUN FIRE DETECTED", tone: "threat", blink: true });
    if (enemySensorsActive) list.push({ text: "ENEMY SENSORS ACTIVE", tone: "warn" });
    if (ship) {
      ship.weapons.pdcs.forEach((_, i) => {
        if ((ship.health[`pdc${i + 1}`] ?? 1) <= 0) list.push({ text: `PDC ${i + 1} OFFLINE`, tone: "threat" });
      });
      if (ship.health.drive <= 0) list.push({ text: "DRIVE OFFLINE", tone: "threat" });
      else if (ship.health.drive < 1) list.push({ text: `DRIVE DAMAGED ${Math.round(ship.health.drive * 100)}%`, tone: "warn" });
      if ((ship.health.railgun ?? 1) <= 0) list.push({ text: "RAILGUN OFFLINE", tone: "threat" });
      if ((ship.health.tubes ?? 1) <= 0) list.push({ text: "TUBES OFFLINE", tone: "threat" });
      if (ship.heat >= 1) list.push({ text: "HEAT CRITICAL", tone: "threat", blink: true });
      else if (ship.heat > sensorTuning.heatWarn) list.push({ text: `HEAT ${Math.round(ship.heat * 100)}%`, tone: "warn" });
      if (ship.strain >= 1) list.push({ text: "G-STRAIN MAX", tone: "threat" });
      else if (ship.strain > crewTuning.strainWarn) list.push({ text: `G-STRAIN ${Math.round(ship.strain * 100)}%`, tone: "warn" });
    }
    if (game.outcome) list.unshift({ text: game.outcome.detail, tone: game.outcome.result === "win" ? "good" : "threat" });
    game.alertList = list;

    // Log the G-strain thresholds as they are crossed, and the end of the fight.
    for (const s of world.ships) {
      if (s.faction !== faction) continue;
      const band = s.strain >= 1 ? 2 : s.strain > crewTuning.strainWarn ? 1 : 0;
      const before = strainBand.get(s.id) ?? 0;
      if (band !== before) {
        const name = shipName(s.id);
        if (band === 2) logLine({ tone: "threat", tpl: `${name}: G-STRAIN AT THE LIMIT, CREW AT RISK` });
        else if (band === 1 && before === 0) logLine({ tone: "warn", tpl: `${name}: G-STRAIN ${Math.round(s.strain * 100)}%, CREW EFFICIENCY FALLING` });
        else if (band === 0) logLine({ tone: "info", tpl: `${name}: G-STRAIN RECOVERED` });
        strainBand.set(s.id, band);
      }
    }
  }

  function rebuildPicture(alpha: number) {
    const pic = buildPicture(world, faction, sensorTuning.godView);
    const lerp = (id: string, p: Vec3) => {
      const a = prev.get(id);
      if (!a) return;
      p.x = a.x + (p.x - a.x) * alpha;
      p.y = a.y + (p.y - a.y) * alpha;
      p.z = a.z + (p.z - a.z) * alpha;
    };
    for (const s of pic.ownShips) lerp(s.id, s.position);
    // Only what is seen now moves smoothly: a lost contact stays where it was last seen, and
    // one seen a moment ago is carried along its own motion, not the truth.
    for (const t of pic.tracks) if (!t.lost && (t.allegiance === "friendly" || t.kind === "station" || t.contributors.length)) lerp(t.id, t.position);
    game.picture = pic;
  }

  const game: Game = {
    world,
    playerFaction: faction,
    picture: buildPicture(world, faction),
    selectedId: world.ships.find((s) => s.faction === faction)?.id ?? null,
    activeShipId: world.ships.find((s) => s.faction === faction)?.id ?? null,
    paused: false,
    outcome: null,
    compressionIndex: 0,
    notice: null,
    predictions: new Map(),
    alerts: { launchDetected: false, impactIn: null, railgunDetected: false, slugImpactIn: null },
    alertList: [],
    alertLog: [],
    shotPaths: new Map(),
    torpedoPaths: new Map(),
    get simTime() {
      return world.tick * DT;
    },
    get renderTime() {
      // The picture blends the last two ticks by the leftover fraction of a tick.
      return (world.tick - 1 + accumulator) * DT;
    },
    get compression() {
      return timeTuning.compressionSteps[game.compressionIndex];
    },
    positionOf(id) {
      const p = game.picture;
      return (
        p.ownShips.find((s) => s.id === id)?.position ??
        p.tracks.find((t) => t.id === id)?.position ??
        p.bodies.find((b) => b.id === id)?.position ??
        null
      );
    },
    factionOf(id) {
      return shipFaction.get(id);
    },
    takeEvents() {
      const out = eventQueue;
      eventQueue = [];
      return out;
    },
    issue(command) {
      submit(world, faction, command);
    },
    setCompression(index) {
      game.compressionIndex = Math.max(0, Math.min(timeTuning.compressionSteps.length - 1, index));
    },
    togglePause() {
      game.paused = !game.paused;
    },
    restart() {
      world = loadScenario(scenario);
      game.world = world;
      prev.clear();
      shipFaction.clear();
      shipNames.clear();
      eventQueue = [];
      game.alertLog = [];
      strainBand.clear();
      game.outcome = null;
      snapshotPrev();
      accumulator = 0;
      overloadFrames = 0;
      lastHullHit = lastCasualties = -Infinity;
      railgunAlertUntil = launchAlertUntil = -Infinity;
      alertsPrimed = false;
      for (const set of [threatWarned, knownHostileShots, knownHostileTorpedoes]) set.clear();
      runs.clear();
      torpedoRuns.clear();
      game.predictions.clear();
      game.torpedoPaths.clear();
      game.shotPaths.clear();
      game.selectedId = game.activeShipId = world.ships.find((s) => s.faction === faction)?.id ?? null;
      game.compressionIndex = 0;
      game.paused = false;
      hostileAtStart = countHostiles();
      hostileEscaped = 0;
      game.picture = buildPicture(world, faction, sensorTuning.godView);
      liveContacts.clear();
      newContact = null;
      enemySensorsActive = false;
      updateContacts();
      setNotice("SCENARIO RESTARTED");
      logLine({ tone: "info", tpl: `${scenario.name.toUpperCase()}: RESTARTED` });
    },
    update(realDt) {
      realClock += realDt;
      if (game.notice && realClock > noticeUntil) game.notice = null;

      if (!game.paused) {
        accumulator += realDt * TICK_RATE * game.compression;
        let ticks = Math.floor(accumulator);
        accumulator -= ticks;
        if (ticks > MAX_TICKS_PER_FRAME) ticks = MAX_TICKS_PER_FRAME;

        const start = performance.now();
        let overloaded = false;
        for (let i = 0; i < ticks; i++) {
          snapshotPrev();
          step(world);
          if (world.events.length && eventQueue.length < EVENT_QUEUE_MAX) eventQueue.push(...world.events);
          for (const d of draftsFromEvents(world.events, logContext)) logLine(d);
          for (const e of world.events) if (e.type === "escaped" && areHostile(world, faction, e.faction)) hostileEscaped++;
          updateContacts();
          const outcome = game.outcome ? null : evaluateOutcome(world, faction, { hostileAtStart, escaped: hostileEscaped });
          if (outcome) {
            game.outcome = outcome;
            game.paused = true;
            accumulator = 0;
            logLine({ tone: outcome.result === "win" ? "good" : outcome.result === "loss" ? "threat" : "info", tpl: `${outcome.title}: ${outcome.detail}` });
            break;
          }
          if (checkSlowdown(world.events)) {
            accumulator = 0;
            break;
          }
          if (performance.now() - start > timeTuning.maxSimMsPerFrame) {
            overloaded = true;
            accumulator = 0;
            break;
          }
        }
        overloadFrames = overloaded ? overloadFrames + 1 : 0;
        if (overloadFrames >= OVERLOAD_FRAMES && game.compressionIndex > 0) {
          game.compressionIndex--;
          overloadFrames = 0;
          setNotice(`TIME COMPRESSION LIMITED: SIM LOAD (${game.compression}x)`);
        }
      }
      updatePredictions();
      updateTorpedoPaths();
      rebuildPicture(accumulator);
      applyTorpedoPaths();
      updateShotPaths();
      updateAlerts();
    },
  };
  hostileAtStart = countHostiles();
  updateContacts(); // what is in view at the start is not news
  logLine({ tone: "info", tpl: `${scenario.name.toUpperCase()}: STARTED` });
  return game;
}
