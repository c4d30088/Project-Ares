import { describe, expect, it } from "vitest";
import { G0, shipClasses } from "../src/data/ships";
import { clampOutsideBodies, cruiseAccel, hardRadius, routeAim, safetyRadius } from "../src/sim/autopilot";
import type { Command } from "../src/sim/commands";
import { Predictor } from "../src/sim/predict";
import { DT, step, submit } from "../src/sim/sim";
import { length, sub, type Vec3 } from "../src/sim/vec3";
import type { Body, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const MOON_R = 500_000;
const FRIGATE_CRUISE = shipClasses.frigate.cruiseG * G0;

function moon(at: Vec3, extra: Partial<Body> = {}): Body {
  return { id: "moon", name: "MOON", kind: "moon", position: at, radius: MOON_R, ...extra };
}

function worldWithMoon(moonAt: Vec3, extra: Parameters<typeof makeShip>[0][] = []): World {
  const world = makeWorld([makeShip({ id: "ff" }), ...extra.map((e) => makeShip(e))]);
  world.bodies.push(moon(moonAt));
  return world;
}

/** Runs until the ship's order completes, tracking its closest approach to body 0's center. */
function run(world: World, command: Command, limitS = 4 * 3600) {
  submit(world, "blue", command);
  const ship = world.ships[0];
  const center = world.bodies[0].position;
  let closest = Infinity;
  let doneTick: number | null = null;
  for (let i = 0; i < limitS / DT && doneTick === null; i++) {
    step(world);
    closest = Math.min(closest, length(sub(ship.position, center)));
    if (world.events.some((e) => e.type === "orderComplete" && e.ship === "ff")) doneTick = world.tick;
  }
  return { ship, closest, doneTick };
}

describe("safety zones from gravity", () => {
  it("a low-gravity asteroid's zone is just its hard limit, close to the rock", () => {
    const ast: Body = { id: "a", name: "A", kind: "asteroid", position: v3(0, 0, 0), radius: 11_000 };
    expect(safetyRadius(ast, FRIGATE_CRUISE)).toBeCloseTo(hardRadius(ast), 6);
    expect(hardRadius(ast)).toBeLessThan(11_000 * 1.5);
  });

  it("a heavy body's zone is set by its point of no return, wider for weaker drives", () => {
    const heavy = moon(v3(0, 0, 0), { gm: 1e14 });
    const corvette = shipClasses.corvette.cruiseG * G0;
    const capital = shipClasses.capital.cruiseG * G0;
    expect(safetyRadius(heavy, corvette)).toBeGreaterThan(hardRadius(heavy));
    expect(safetyRadius(heavy, capital)).toBeGreaterThan(safetyRadius(heavy, corvette));
  });
});

describe("routing around bodies", () => {
  it("routeAim leaves a clear line alone and detours a blocked one", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0));
    expect(routeAim(world, v3(0, 0, 0), v3(0, 3_000_000, 0), FRIGATE_CRUISE).detour).toBe(false);
    const r = routeAim(world, v3(0, 0, 0), v3(4_000_000, 0, 0), FRIGATE_CRUISE);
    expect(r.detour).toBe(true);
    expect(length(sub(r.aim, v3(2_000_000, 0, 0)))).toBeGreaterThan(safetyRadius(world.bodies[0], FRIGATE_CRUISE));
    expect(r.pathLength).toBeGreaterThan(4_000_000);
  });

  it("burn to a point directly behind a moon: goes around and still arrives at rest", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0));
    const target = v3(4_000_000, 0, 0);
    const { ship, closest, doneTick } = run(world, { type: "burnTo", ship: "ff", point: target });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(hardRadius(world.bodies[0]) * 0.98);
    expect(length(sub(ship.position, target))).toBeLessThan(50);
    expect(length(ship.velocity)).toBeLessThan(0.5);
  });

  it("burn to an off-axis 3D point past a moon, starting with velocity", () => {
    const world = worldWithMoon(v3(1_500_000, 400_000, 100_000));
    world.ships[0].velocity = v3(500, 200, 0);
    const target = v3(3_500_000, 900_000, 300_000);
    const { ship, closest, doneTick } = run(world, { type: "burnTo", ship: "ff", point: target, g: "combat" });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(hardRadius(world.bodies[0]) * 0.98);
    expect(length(sub(ship.position, target))).toBeLessThan(50);
  });

  it("rendezvous with a target behind a moon goes around", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0), [
      { id: "tgt", faction: "red", position: v3(4_000_000, 100_000, 0), velocity: v3(0, 300, 0), heading: v3(0, 1, 0) },
    ]);
    const { closest, doneTick } = run(world, { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "rendezvous" });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(MOON_R * 1.02);
  });

  it("fast pass on a target behind a moon goes around", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0), [
      { id: "tgt", faction: "red", position: v3(5_000_000, 0, 0), velocity: v3(-200, 0, 0), heading: v3(-1, 0, 0) },
    ]);
    const { closest, doneTick } = run(world, { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "fastPass" });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(MOON_R * 1.02);
  });

  it("the predicted detour matches the real flight", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0));
    submit(world, "blue", { type: "burnTo", ship: "ff", point: v3(4_000_000, 0, 0) });
    step(world);
    const p = new Predictor(world, "ff", 4 * 3600);
    while (!p.run(5000));
    const start = world.tick;
    let done: number | null = null;
    while (done === null && world.tick - start < (4 * 3600) / DT) {
      step(world);
      if (world.events.some((e) => e.type === "orderComplete")) done = world.tick;
    }
    expect((done! - start) * DT).toBeCloseTo(p.result.arrival!.t, 6);
    for (const pt of p.result.points) expect(length(sub(pt.position, v3(2_000_000, 0, 0)))).toBeGreaterThan(MOON_R);
  });

  it("a destination inside a safety zone is moved to the zone's edge", () => {
    const m = moon(v3(2_000_000, 0, 0));
    const inside = v3(2_000_000 - MOON_R - 10_000, 0, 0);
    const { point, clamped } = clampOutsideBodies([m], inside, FRIGATE_CRUISE);
    expect(clamped).toBe(true);
    expect(length(sub(point, m.position))).toBeGreaterThanOrEqual(safetyRadius(m, FRIGATE_CRUISE));
    expect(point.x).toBeLessThan(inside.x);
    expect(clampOutsideBodies([m], v3(0, 0, 0), FRIGATE_CRUISE).clamped).toBe(false);
  });

  it("asteroids can be approached closely: a point 3 km off the hard limit is allowed and reached", () => {
    const AST_R = 11_000;
    const world = makeWorld([makeShip({ id: "ff" })]);
    const ast: Body = { id: "ast", name: "AST", kind: "asteroid", position: v3(1_000_000, 0, 0), radius: AST_R };
    world.bodies.push(ast);
    const target = v3(1_000_000 + hardRadius(ast) + 3_000, 0, 0); // on the far side, very close
    expect(clampOutsideBodies(world.bodies, target, cruiseAccel(world.ships[0])).clamped).toBe(false);
    const { ship, closest, doneTick } = run(world, { type: "burnTo", ship: "ff", point: target });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(AST_R * 1.25); // never touches even the bumpiest surface
    expect(length(sub(ship.position, target))).toBeLessThan(50);
  });

  it("a ship inside a heavy body's safety zone still goes around the body itself", () => {
    const world = makeWorld([makeShip({ id: "ff", g: "max" })]);
    world.bodies.push(moon(v3(0, 0, 0), { gm: 1e13 }));
    const b = world.bodies[0];
    const start = v3(-900_000, 0, 0);
    expect(length(start)).toBeLessThan(safetyRadius(b, FRIGATE_CRUISE));
    expect(length(start)).toBeGreaterThan(hardRadius(b));
    world.ships[0].position = start;
    expect(routeAim(world, start, v3(3_000_000, 0, 0), FRIGATE_CRUISE).detour).toBe(true);
    const { closest, doneTick } = run(world, { type: "burnTo", ship: "ff", point: v3(3_000_000, 0, 0), g: "max" });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(MOON_R * 1.02);
  });
});
