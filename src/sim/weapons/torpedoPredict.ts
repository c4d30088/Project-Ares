// Ghost run of one torpedo (ARCHITECTURE.md pattern 5): copy the torpedo and its target,
// fly the real guidance forward, record the path. This is the torpedo's intercept line:
// it bends around bodies exactly as the torpedo will, and ends at the impact (or at the
// point it was sent to).
//
// As for ship routes, the target is assumed to keep coasting.

import { DT, step } from "../sim";
import { clone, type Vec3 } from "../vec3";
import type { World } from "../world";

export interface TorpedoPath {
  torpedoId: string;
  /** World tick the run started from. */
  startTick: number;
  /** Positions every few seconds of sim time, t in seconds after the start. */
  points: { t: number; position: Vec3 }[];
  /** How the flight ends: striking its target, arriving at its point (then searching),
   *  or neither (a miss, or out of fuel). Null until the run is done. */
  end: { t: number; position: Vec3; kind: "impact" | "arrival" | "miss" } | null;
  done: boolean;
}

/** Record a path point at least this often, seconds of sim time. */
const SAMPLE_S = 1;

export class TorpedoPredictor {
  readonly result: TorpedoPath;
  private world: World;
  private readonly maxTicks: number;

  constructor(source: World, torpedoId: string, maxSeconds: number) {
    const torpedo = source.torpedoes.find((t) => t.id === torpedoId);
    if (!torpedo) throw new Error(`torpedo predict: no torpedo ${torpedoId}`);
    const target = torpedo.guidance?.target;
    const targetId = target && target.kind !== "point" ? target.id : null;

    // A minimal copy: the torpedo, its target (coasting), bodies.
    const world: World = structuredClone({
      ...source,
      pending: [],
      events: [],
      ships: source.ships.filter((s) => s.id === targetId),
      torpedoes: [torpedo],
      slugs: [],
      stations: source.stations.filter((s) => s.id === targetId),
    });
    for (const s of world.ships) {
      s.order = null;
      s.thrust = 0;
      s.weapons.launchQueue = [];
      // The path is where the torpedo flies, not whether it survives: no PDC fire.
      for (const m of s.weapons.pdcs) m.mode = "hold";
    }
    this.world = world;
    this.maxTicks = Math.round(maxSeconds / DT);
    this.result = { torpedoId, startTick: source.tick, points: [{ t: 0, position: clone(torpedo.position) }], end: null, done: false };
  }

  /** Runs up to `ticks` more ticks. Returns true when the path is complete. */
  run(ticks: number): boolean {
    const r = this.result;
    if (r.done) return true;
    const w = this.world;
    for (let i = 0; i < ticks; i++) {
      const before = w.torpedoes[0];
      const last = before ? clone(before.position) : null;
      step(w);
      const elapsed = w.tick - r.startTick;
      const t = elapsed * DT;
      const torpedo = w.torpedoes[0];
      if (!torpedo) {
        // Gone this tick: detonated on its target, or spent, timed out or crashed.
        const hit = w.events.some((e) => e.type === "torpedoDetonated");
        const position = last ?? r.points[r.points.length - 1].position;
        r.points.push({ t, position });
        r.end = { t, position, kind: hit ? "impact" : "miss" };
        r.done = true;
        return true;
      }
      if (elapsed % Math.round(SAMPLE_S / DT) === 0) r.points.push({ t, position: clone(torpedo.position) });
      // Sent to a point: the line ends where its seeker takes over.
      if (torpedo.guidance?.stage === "search") {
        r.points.push({ t, position: clone(torpedo.position) });
        r.end = { t, position: clone(torpedo.position), kind: "arrival" };
        r.done = true;
        return true;
      }
      if (elapsed >= this.maxTicks) {
        r.points.push({ t, position: clone(torpedo.position) });
        r.end = { t, position: clone(torpedo.position), kind: "miss" };
        r.done = true;
        return true;
      }
    }
    return false;
  }
}
