import { describe, expect, it } from "vitest";
import { maxAccel } from "../src/sim/autopilot";
import type { SimEvent } from "../src/sim/commands";
import { DT, step, submit } from "../src/sim/sim";
import { length, sub, type Vec3 } from "../src/sim/vec3";
import type { GSetting, Ship, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

interface RunResult {
  arrivedTick: number | null;
  flipTick: number | null;
  maxMisalignedThrust: number;
  events: SimEvent[];
}

/** Steps until the ship's order completes (or the limit), recording events. */
function runUntilArrived(world: World, ship: Ship, limitS: number): RunResult {
  const res: RunResult = { arrivedTick: null, flipTick: null, maxMisalignedThrust: 0, events: [] };
  const limit = Math.round(limitS / DT);
  for (let i = 0; i < limit; i++) {
    step(world);
    for (const e of world.events) {
      res.events.push(e);
      if (e.type === "flipStart" && e.ship === ship.id && res.flipTick === null) res.flipTick = world.tick;
      if (e.type === "orderComplete" && e.ship === ship.id) {
        res.arrivedTick = world.tick;
        return res;
      }
    }
  }
  return res;
}

function burnTo(point: Vec3, opts: { velocity?: Vec3; heading?: Vec3; g?: GSetting } = {}) {
  const ship = makeShip({ id: "ff", velocity: opts.velocity ?? v3(0, 0, 0), heading: opts.heading ?? v3(1, 0, 0) });
  const world = makeWorld([ship]);
  submit(world, "blue", { type: "burnTo", ship: "ff", point, g: opts.g ?? "cruise" });
  return { world, ship };
}

describe("burn to point", () => {
  it("5,000 km from rest at 2 g: arrives at rest, flips near the midpoint, close to the ideal time", () => {
    const target = v3(5_000_000, 0, 0);
    const { world, ship } = burnTo(target);
    const res = runUntilArrived(world, ship, 3 * 3600);
    expect(res.arrivedTick).not.toBeNull();
    expect(length(sub(ship.position, target))).toBeLessThan(50);
    expect(length(ship.velocity)).toBeLessThan(0.5);

    // Ideal accelerate-flip-decelerate time: 2*sqrt(d/a), plus the 12 s flip.
    const a = maxAccel(ship);
    const ideal = 2 * Math.sqrt(5_000_000 / a) + 12;
    const t = res.arrivedTick! * DT;
    expect(t).toBeGreaterThan(ideal * 0.98);
    expect(t).toBeLessThan(ideal * 1.06); // DESIGN.md: "about 17 minutes"
    expect(t / 60).toBeGreaterThan(16);
    expect(t / 60).toBeLessThan(19);

    // Exactly one flip, near the middle of the trip.
    expect(res.events.filter((e) => e.type === "flipStart")).toHaveLength(1);
    const flipFraction = res.flipTick! / res.arrivedTick!;
    expect(flipFraction).toBeGreaterThan(0.43);
    expect(flipFraction).toBeLessThan(0.53);
  });

  it("is faster at Max G than at Cruise", () => {
    const target = v3(5_000_000, 0, 0);
    const cruise = burnTo(target, { g: "cruise" });
    const max = burnTo(target, { g: "max" });
    const tc = runUntilArrived(cruise.world, cruise.ship, 3 * 3600).arrivedTick!;
    const tm = runUntilArrived(max.world, max.ship, 3 * 3600).arrivedTick!;
    expect(tm).toBeLessThan(tc * 0.7);
    // DESIGN.md: same trip at 6 g is about 10 minutes.
    expect((tm * DT) / 60).toBeGreaterThan(9);
    expect((tm * DT) / 60).toBeLessThan(11);
  });

  const cases: [string, Vec3, Vec3, Vec3][] = [
    ["a 3D point above the plane", v3(3_000_000, -2_500_000, 1_800_000), v3(0, 0, 0), v3(0, 1, 0)],
    ["with sideways starting velocity", v3(4_000_000, 0, 0), v3(0, 2_000, 400), v3(1, 0, 0)],
    ["with starting velocity away from the point", v3(2_000_000, 1_000_000, 0), v3(-3_000, -1_000, 0), v3(-1, 0, 0)],
    ["a short hop", v3(2_000, 500, -300), v3(0, 0, 0), v3(0, 0, 1)],
  ];
  for (const [name, target, velocity, heading] of cases) {
    it(`arrives accurately: ${name}`, () => {
      const { world, ship } = burnTo(target, { velocity, heading });
      const res = runUntilArrived(world, ship, 4 * 3600);
      expect(res.arrivedTick).not.toBeNull();
      expect(length(sub(ship.position, target))).toBeLessThan(50);
      expect(length(ship.velocity)).toBeLessThan(0.5);
    });
  }

  it("never fires the drive while the bow is turning", () => {
    const { world, ship } = burnTo(v3(-1_000_000, 0, 0), { heading: v3(1, 0, 0) });
    // The ship starts pointing away; for the first ~12 s it must only turn.
    for (let i = 0; i < Math.round(11.5 / DT); i++) {
      step(world);
      expect(ship.thrust).toBe(0);
    }
  });

  it("holds station at the point after arriving", () => {
    const target = v3(1_000_000, 0, 0);
    const { world, ship } = burnTo(target);
    runUntilArrived(world, ship, 3600);
    for (let i = 0; i < Math.round(600 / DT); i++) step(world);
    expect(length(sub(ship.position, target))).toBeLessThan(1000);
    expect(ship.order?.type).toBe("stationKeep");
  });
});
