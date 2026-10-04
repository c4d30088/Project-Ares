// Ghost-run prediction (ARCHITECTURE.md pattern 5): copy the ship, run the real nav
// computer forward, record the path. What the player sees is what will happen unless
// something interferes.
//
// Only the predicted ship and its target are copied. The target is assumed to keep
// coasting: the player knows where it is and how it moves, not what it intends.

import type { Target } from "./target";
import { DT, step } from "./sim";
import { clone, length, sub, type Vec3 } from "./vec3";
import type { World } from "./world";

export interface PathPoint {
  /** Seconds after the prediction started. */
  t: number;
  position: Vec3;
  burning: boolean;
}

export interface Prediction {
  shipId: string;
  /** World tick the prediction started from. */
  startTick: number;
  points: PathPoint[];
  flip: { t: number; position: Vec3 } | null;
  /** Where and when the order completes. Speed is relative to the target for orders
   *  against a ship or object, otherwise absolute. */
  arrival: { t: number; position: Vec3; speed: number; relative: boolean } | null;
  /** True once the run has reached the end of the order or the time limit. */
  done: boolean;
}

/** Record a path point at least this often (seconds), and whenever burning starts or stops. */
const SAMPLE_S = 2;

function targetIdOf(target: Target | undefined): string | null {
  return target && target.kind !== "point" ? target.id : null;
}

export class Predictor {
  readonly result: Prediction;
  private world: World;
  private lastSampleTick = 0;
  private lastBurning: boolean | null = null;
  private readonly maxTicks: number;
  private readonly targetId: string | null;

  constructor(source: World, shipId: string, maxSeconds: number) {
    const ship = source.ships.find((s) => s.id === shipId);
    if (!ship) throw new Error(`predict: no ship ${shipId}`);
    const order = ship.order;
    const targetId = targetIdOf(order && "target" in order ? order.target : undefined);

    // A minimal copy: the ship, its target (coasting), and charted bodies.
    const world: World = structuredClone({
      ...source,
      // Only movement: weapons fired in the ghost run would change the future it predicts.
      pending: source.pending.filter((q) => q.command.ship === shipId && q.command.type !== "launchTorpedoes"),
      events: [],
      ships: source.ships.filter((s) => s.id === shipId || s.id === targetId),
      torpedoes: source.torpedoes.filter((t) => t.id === targetId),
      slugs: [],
      ai: [],
      aiGroups: {},
      stations: source.stations.filter((s) => s.id === targetId),
    });
    for (const s of world.ships) {
      s.weapons.launchQueue = [];
      for (const m of s.weapons.pdcs) m.mode = "hold";
      if (s.id !== shipId) {
        s.order = null;
        s.thrust = 0;
      }
    }
    // A torpedo target is assumed to coast too: no guidance in the ghost run.
    for (const t of world.torpedoes) {
      t.thrust = 0;
      delete t.guidance;
    }

    this.world = world;
    this.targetId = targetId;
    this.maxTicks = Math.round(maxSeconds / DT);
    this.result = {
      shipId,
      startTick: source.tick,
      points: [{ t: 0, position: clone(ship.position), burning: ship.thrust > 0 }],
      flip: null,
      arrival: null,
      done: false,
    };
  }

  /** Ship speed relative to the target (if it is a moving entity), else absolute. */
  private relativeSpeed(ship: World["ships"][number]): number {
    const w = this.world;
    const id = this.targetId;
    const tgt = id ? w.ships.find((s) => s.id === id) ?? w.torpedoes.find((s) => s.id === id) ?? w.stations.find((s) => s.id === id) : undefined;
    return length(tgt ? sub(ship.velocity, tgt.velocity) : ship.velocity);
  }

  /** Runs up to `ticks` more ticks. Returns true when the prediction is complete. */
  run(ticks: number): boolean {
    const r = this.result;
    if (r.done) return true;
    const w = this.world;
    const ship = w.ships.find((s) => s.id === r.shipId)!;
    for (let i = 0; i < ticks; i++) {
      step(w);
      const elapsedTicks = w.tick - r.startTick;
      const t = elapsedTicks * DT;
      const burning = ship.thrust > 0;
      if (burning !== this.lastBurning || elapsedTicks - this.lastSampleTick >= SAMPLE_S / DT) {
        r.points.push({ t, position: clone(ship.position), burning });
        this.lastSampleTick = elapsedTicks;
        this.lastBurning = burning;
      }
      for (const e of w.events) {
        if (e.type === "flipStart" && e.ship === r.shipId && !r.flip) r.flip = { t, position: clone(ship.position) };
        if (e.type === "orderComplete" && e.ship === r.shipId) {
          r.arrival = { t, position: clone(ship.position), speed: this.relativeSpeed(ship), relative: !!this.targetId };
          r.points.push({ t, position: clone(ship.position), burning: false });
          r.done = true;
          return true;
        }
      }
      // Station-keep never ends; the trip ends when the ship settles into its hold box. The
      // first time, that raises orderComplete (handled above); after that it is silent.
      if (ship.order?.type === "stationKeep" && ship.nav.complete && ship.nav.phase === "hold" && !r.arrival) {
        r.arrival = { t, position: clone(ship.position), speed: this.relativeSpeed(ship), relative: !!this.targetId };
        r.points.push({ t, position: clone(ship.position), burning: false });
        r.done = true;
        return true;
      }
      if (!ship.order || elapsedTicks >= this.maxTicks) {
        r.points.push({ t, position: clone(ship.position), burning });
        r.done = true;
        return true;
      }
    }
    return false;
  }
}
