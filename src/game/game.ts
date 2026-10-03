// Game state outside the sim: the world, time control, the player's sensor picture
// (interpolated for smooth rendering), selection, and the player's command channel.

import { timeTuning } from "../data/time";
import { pathTuning } from "../data/paths";
import { Predictor, type Prediction } from "../sim/predict";
import type { Command, SimEvent } from "../sim/commands";
import { loadScenario, type Scenario } from "../sim/scenario";
import { buildPerfectPicture, type SensorPicture } from "../sim/sensors/picture";
import { DT, step, submit, TICK_RATE } from "../sim/sim";
import type { Vec3 } from "../sim/vec3";
import { areHostile, type World } from "../sim/world";
import { predictImpact } from "../sim/weapons/torpedo";

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
  compressionIndex: number;
  /** Short message explaining an automatic time change, or null. */
  notice: string | null;
  /** Latest predicted path for each of the player's ships with a movement order. */
  predictions: Map<string, Prediction>;
  /** Alerts for the top strip, from the player's picture. impactIn: seconds until the
   *  soonest hostile torpedo reaches one of our ships. */
  alerts: { launchDetected: boolean; impactIn: number | null };
  readonly simTime: number;
  readonly compression: number;
  positionOf(id: string): Vec3 | null;
  /** Submits a command as the player's faction. */
  issue(command: Command): void;
  setCompression(index: number): void;
  togglePause(): void;
  /** Advances the sim by real seconds (scaled by compression) and rebuilds the picture. */
  update(realDt: number): void;
}

export function createGame(scenario: Scenario): Game {
  const world = loadScenario(scenario);
  const faction = scenario.playerFaction;

  // Positions before the most recent tick, for interpolation.
  const prev = new Map<string, Vec3>();
  const snapshotPrev = () => {
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
  const shipName = (shipId: string) => world.ships.find((s) => s.id === shipId)?.name ?? shipId;

  function setNotice(text: string) {
    game.notice = text;
    noticeUntil = realClock + NOTICE_SECONDS;
  }

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
    // Perfect sensors until M4: a launch is detected the moment it happens.
    for (const e of events) {
      if (e.type === "torpedoLaunched" && timeTuning.slowOnLaunch && areHostile(world, faction, e.faction) && slow("LAUNCH DETECTED")) return true;
    }
    if (timeTuning.slowOnThreatS > 0) {
      for (const t of world.torpedoes) {
        if (threatWarned.has(t.id) || !areHostile(world, faction, t.faction)) continue;
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

  // Alerts read the player's picture (CLAUDE.md rule 6): a hostile torpedo track not seen
  // before is a detected launch.
  const knownHostileTorpedoes = new Set<string>();
  let launchAlertUntil = -Infinity;
  let alertsPrimed = false;
  function updateAlerts() {
    const own = new Set(game.picture.ownShips.map((s) => s.id));
    let impactIn: number | null = null;
    for (const t of game.picture.tracks) {
      if (t.kind !== "torpedo" || t.allegiance !== "hostile") continue;
      if (!knownHostileTorpedoes.has(t.id)) {
        knownHostileTorpedoes.add(t.id);
        // Torpedoes already flying when the scenario starts are not launches.
        if (alertsPrimed) launchAlertUntil = realClock + timeTuning.launchAlertS;
      }
      if (t.impact?.targetId && own.has(t.impact.targetId)) impactIn = Math.min(impactIn ?? Infinity, t.impact.t);
    }
    alertsPrimed = true;
    game.alerts = { launchDetected: realClock < launchAlertUntil, impactIn };
  }

  function rebuildPicture(alpha: number) {
    const pic = buildPerfectPicture(world, faction);
    const lerp = (id: string, p: Vec3) => {
      const a = prev.get(id);
      if (!a) return;
      p.x = a.x + (p.x - a.x) * alpha;
      p.y = a.y + (p.y - a.y) * alpha;
      p.z = a.z + (p.z - a.z) * alpha;
    };
    for (const s of pic.ownShips) lerp(s.id, s.position);
    for (const t of pic.tracks) lerp(t.id, t.position);
    game.picture = pic;
  }

  const game: Game = {
    world,
    playerFaction: faction,
    picture: buildPerfectPicture(world, faction),
    selectedId: world.ships.find((s) => s.faction === faction)?.id ?? null,
    activeShipId: world.ships.find((s) => s.faction === faction)?.id ?? null,
    paused: false,
    compressionIndex: 0,
    notice: null,
    predictions: new Map(),
    alerts: { launchDetected: false, impactIn: null },
    get simTime() {
      return world.tick * DT;
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
    issue(command) {
      submit(world, faction, command);
    },
    setCompression(index) {
      game.compressionIndex = Math.max(0, Math.min(timeTuning.compressionSteps.length - 1, index));
    },
    togglePause() {
      game.paused = !game.paused;
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
      rebuildPicture(accumulator);
      updateAlerts();
    },
  };
  return game;
}
