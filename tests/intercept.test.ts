import { describe, expect, it } from "vitest";
import { navTuning } from "../src/data/nav";
import { interceptTime, maxAccel } from "../src/sim/autopilot";
import { Predictor } from "../src/sim/predict";
import { DT, step, submit } from "../src/sim/sim";
import { add, dot, length, scale, sub, type Vec3 } from "../src/sim/vec3";
import type { Ship, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

function setup(targetPos: Vec3, targetVel: Vec3, shipVel: Vec3 = v3(0, 0, 0)) {
  const ship = makeShip({ id: "ff", velocity: shipVel });
  const target = makeShip({ id: "tgt", faction: "red", position: targetPos, velocity: targetVel, heading: v3(0, 1, 0) });
  const world = makeWorld([ship, target]);
  return { world, ship, target };
}

/** Steps until orderComplete for ship "ff". Returns the tick it happened, or null. */
function runToComplete(world: World, limitS: number, onStep?: () => void): number | null {
  for (let i = 0; i < limitS / DT; i++) {
    step(world);
    onStep?.();
    if (world.events.some((e) => e.type === "orderComplete" && e.ship === "ff")) return world.tick;
  }
  return null;
}

const rel = (a: Ship, b: Ship) => ({ r: sub(b.position, a.position), v: sub(a.velocity, b.velocity) });

describe("intercept: rendezvous", () => {
  it("arrives alongside a coasting target with matched velocity, then holds station", () => {
    const { world, ship, target } = setup(v3(3_000_000, 2_500_000, 800_000), v3(-1200, 400, 0));
    submit(world, "blue", { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "rendezvous" });
    const done = runToComplete(world, 4 * 3600);
    expect(done).not.toBeNull();
    const { r, v } = rel(ship, target);
    expect(Math.abs(length(r) - navTuning.rendezvousStandoff)).toBeLessThan(navTuning.rendezvousArriveDistance + 50);
    expect(length(v)).toBeLessThan(navTuning.rendezvousArriveSpeed);
    expect(ship.order?.type).toBe("stationKeep");

    // Ten minutes later it is still alongside.
    for (let i = 0; i < 600 / DT; i++) step(world);
    const after = rel(ship, target);
    expect(Math.abs(length(after.r) - navTuning.rendezvousStandoff)).toBeLessThan(navTuning.stationHoldRadius + 200);
    expect(length(after.v)).toBeLessThan(navTuning.stationHoldSpeed + 0.5);
  });

  it("works when chasing a target moving away", () => {
    const { world, ship, target } = setup(v3(1_000_000, 0, 0), v3(2000, 500, 0), v3(0, -1000, 0));
    submit(world, "blue", { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "rendezvous", g: "combat" });
    expect(runToComplete(world, 4 * 3600)).not.toBeNull();
    expect(length(rel(ship, target).v)).toBeLessThan(navTuning.rendezvousArriveSpeed);
  });

  it("prediction matches the real arrival against a coasting target", () => {
    const { world } = setup(v3(2_000_000, -1_000_000, 300_000), v3(800, 800, -100));
    submit(world, "blue", { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "rendezvous" });
    step(world);
    const p = new Predictor(world, "ff", 4 * 3600);
    while (!p.run(5000));
    const start = world.tick;
    const done = runToComplete(world, 4 * 3600);
    expect((done! - start) * DT).toBeCloseTo(p.result.arrival!.t, 6);
  });
});

describe("intercept: fast pass", () => {
  it("interceptTime solves |r + wT| = aT²/2", () => {
    const r = v3(1e6, 2e5, 0), w = v3(-500, 300, 100), a = 20;
    const T = interceptTime(r, w, a);
    expect(length(add(r, scale(w, T)))).toBeCloseTo(0.5 * a * T * T, 0);
  });

  it("passes close to a coasting target at high closing speed, then stops burning", () => {
    const { world, ship, target } = setup(v3(4_000_000, 1_500_000, -600_000), v3(-1500, 600, 0));
    submit(world, "blue", { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "fastPass", g: "combat" });
    // Closest approach between ticks, from the relative motion over each tick.
    let closest = Infinity;
    let prev = rel(ship, target).r;
    const done = runToComplete(world, 4 * 3600, () => {
      const r = rel(ship, target).r;
      const seg = sub(r, prev);
      const t = Math.max(0, Math.min(1, -dot(prev, seg) / Math.max(dot(seg, seg), 1e-9)));
      closest = Math.min(closest, length(add(prev, scale(seg, t))));
      prev = r;
    });
    expect(done).not.toBeNull();
    expect(closest).toBeLessThan(1000);
    expect(length(rel(ship, target).v)).toBeGreaterThan(5000); // a fast pass, not a rendezvous
    expect(ship.order).toBeNull();
    step(world);
    expect(ship.thrust).toBe(0);
  });
});

describe("match velocity", () => {
  it("nulls relative velocity and keeps matching", () => {
    const { world, ship, target } = setup(v3(500_000, 0, 0), v3(-300, 1200, 50), v3(400, 0, 0));
    submit(world, "blue", { type: "matchVelocity", ship: "ff", target: { kind: "track", id: "tgt" }, g: "cruise" });
    const done = runToComplete(world, 3600);
    expect(done).not.toBeNull();
    expect(length(rel(ship, target).v)).toBeLessThan(navTuning.matchSpeedTolerance);
    // Time is roughly delta-v / a plus at most one flip.
    const dv = length(v3(-700, 1200, 50));
    expect(done! * DT).toBeLessThan(dv / maxAccel(ship) + 12 + 2);
    for (let i = 0; i < 300 / DT; i++) step(world);
    expect(length(rel(ship, target).v)).toBeLessThan(navTuning.matchSpeedTolerance + 0.1);
  });
});
