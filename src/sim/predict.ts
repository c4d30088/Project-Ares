// Ghost-run prediction (ARCHITECTURE.md pattern 5): copy the ship, run the real nav
// computer forward, record the path. What the player sees is what will happen unless
// something interferes.
//
// Only the predicted ship and its target are copied. The target is assumed to keep
// coasting: the player knows where it is and how it moves, not what it intends.

import type { Target } from "./target";
import { DT, step } from "./sim";
import { clone, length, type Vec3 } from "./vec3";
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
  arrival: { t: number; position: Vec3; speed: number } | null;
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

  constructor(source: World, shipId: string, maxSeconds: number) {
    const ship = source.ships.find((s) => s.id === shipId);
    if (!ship) throw new Error(`predict: no ship ${shipId}`);
    const order = ship.order;
    const targetId = targetIdOf(order && "target" in order ? order.target : undefined);

    // A minimal copy: the ship, its target (coasting), and charted bodies.
    const world: World = structuredClone({
      ...source,
      pending: source.pending.filter((q) => q.command.ship === shipId),
      events: [],
      ships: source.ships.filter((s) => s.id === shipId || s.id === targetId),
      torpedoes: source.torpedoes.filter((t) => t.id === targetId),
      stations: source.stations.filter((s) => s.id === targetId),
    });
    for (const s of world.ships) {
      if (s.id !== shipId) {
        s.order = null;
        s.thrust = 0;
      }
    }
    for (const t of world.torpedoes) t.thrust = 0;

    this.world = world;
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
          r.arrival = { t, position: clone(ship.position), speed: length(ship.velocity) };
          r.points.push({ t, position: clone(ship.position), burning: false });
          r.done = true;
          return true;
        }
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
