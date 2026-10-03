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
import type { World } from "../sim/world";

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
  paused: boolean;
  compressionIndex: number;
  /** Short message explaining an automatic time change, or null. */
  notice: string | null;
  /** Latest predicted path for each of the player's ships with a movement order. */
  predictions: Map<string, Prediction>;
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

  /** Auto-slowdown (DESIGN.md section 5). Returns true if time was slowed. */
  function checkSlowdown(events: SimEvent[]): boolean {
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

  // Predictions: one running predictor per ship, restarted when the order changes or the
  // refresh interval passes. The last finished result stays on screen meanwhile.
  const predicted = new Set(["burnTo", "intercept", "matchVelocity"]);
  const runs = new Map<string, { predictor: Predictor; orderKey: string; startedAt: number }>();
  function updatePredictions() {
    const wanted = world.ships.filter((s) => s.faction === faction && s.order && predicted.has(s.order.type));
    for (const id of [...runs.keys()]) {
      if (!wanted.some((s) => s.id === id)) {
        runs.delete(id);
        game.predictions.delete(id);
      }
    }
    for (const s of wanted) {
      const key = JSON.stringify(s.order) + s.g;
      const run = runs.get(s.id);
      const stale = !run || run.orderKey !== key || (run.predictor.result.done && realClock - run.startedAt > pathTuning.refreshS);
      if (stale) {
        if (run && run.orderKey !== key) game.predictions.delete(s.id);
        runs.set(s.id, { predictor: new Predictor(world, s.id, pathTuning.maxPredictS), orderKey: key, startedAt: realClock });
      }
    }
    const start = performance.now();
    for (const [id, run] of runs) {
      while (!run.predictor.result.done && performance.now() - start < pathTuning.budgetMs) run.predictor.run(400);
      // Show a finished prediction, or the first one while it is still being computed.
      if (run.predictor.result.done || !game.predictions.has(id)) game.predictions.set(id, run.predictor.result);
    }
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
    paused: false,
    compressionIndex: 0,
    notice: null,
    predictions: new Map(),
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
    },
  };
  return game;
}
