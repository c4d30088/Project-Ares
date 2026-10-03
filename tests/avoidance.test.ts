import { describe, expect, it } from "vitest";
import { clampOutsideBodies, hardRadius, routeAim, safetyRadius } from "../src/sim/autopilot";
import type { Command } from "../src/sim/commands";
import { Predictor } from "../src/sim/predict";
import { DT, step, submit } from "../src/sim/sim";
import { length, sub, type Vec3 } from "../src/sim/vec3";
import type { World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const MOON_R = 500_000;

function worldWithMoon(moonAt: Vec3, extra: Parameters<typeof makeShip>[0][] = []): World {
  const world = makeWorld([makeShip({ id: "ff" }), ...extra.map((e) => makeShip(e))]);
  world.bodies.push({ id: "moon", name: "MOON", kind: "moon", position: moonAt, radius: MOON_R });
  return world;
}

/** Runs until the ship's order completes, tracking its closest approach to the moon's center. */
function run(world: World, command: Command, limitS = 4 * 3600) {
  submit(world, "blue", command);
  const ship = world.ships[0];
  const moon = world.bodies[0].position;
  let closest = Infinity;
  let doneTick: number | null = null;
  for (let i = 0; i < limitS / DT && doneTick === null; i++) {
    step(world);
    closest = Math.min(closest, length(sub(ship.position, moon)));
    if (world.events.some((e) => e.type === "orderComplete" && e.ship === "ff")) doneTick = world.tick;
  }
  return { ship, closest, doneTick };
}

describe("routing around bodies", () => {
  it("routeAim leaves a clear line alone and detours a blocked one", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0));
    expect(routeAim(world, v3(0, 0, 0), v3(0, 3_000_000, 0)).detour).toBe(false);
    const r = routeAim(world, v3(0, 0, 0), v3(4_000_000, 0, 0));
    expect(r.detour).toBe(true);
    expect(length(sub(r.aim, v3(2_000_000, 0, 0)))).toBeGreaterThan(safetyRadius(MOON_R));
    expect(r.pathLength).toBeGreaterThan(4_000_000);
  });

  it("burn to a point directly behind a moon: goes around and still arrives at rest", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0));
    const target = v3(4_000_000, 0, 0);
    const { ship, closest, doneTick } = run(world, { type: "burnTo", ship: "ff", point: target });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(MOON_R * 1.05);
    expect(length(sub(ship.position, target))).toBeLessThan(50);
    expect(length(ship.velocity)).toBeLessThan(0.5);
  });

  it("burn to an off-axis 3D point past a moon, starting with velocity", () => {
    const world = worldWithMoon(v3(1_500_000, 400_000, 100_000));
    world.ships[0].velocity = v3(500, 200, 0);
    const target = v3(3_500_000, 900_000, 300_000);
    const { ship, closest, doneTick } = run(world, { type: "burnTo", ship: "ff", point: target, g: "combat" });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(MOON_R * 1.05);
    expect(length(sub(ship.position, target))).toBeLessThan(50);
  });

  it("rendezvous with a target behind a moon goes around", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0), [
      { id: "tgt", faction: "red", position: v3(4_000_000, 100_000, 0), velocity: v3(0, 300, 0), heading: v3(0, 1, 0) },
    ]);
    const { closest, doneTick } = run(world, { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "rendezvous" });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(MOON_R * 1.05);
  });

  it("fast pass on a target behind a moon goes around", () => {
    const world = worldWithMoon(v3(2_000_000, 0, 0), [
      { id: "tgt", faction: "red", position: v3(5_000_000, 0, 0), velocity: v3(-200, 0, 0), heading: v3(-1, 0, 0) },
    ]);
    const { closest, doneTick } = run(world, { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "fastPass" });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(MOON_R * 1.05);
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
    // And the predicted path stays out of the moon too.
    for (const pt of p.result.points) expect(length(sub(pt.position, v3(2_000_000, 0, 0)))).toBeGreaterThan(MOON_R * 1.05);
  });

  it("a destination inside a safety zone is moved to the zone's edge", () => {
    const moon = { position: v3(2_000_000, 0, 0), radius: MOON_R };
    const inside = v3(2_000_000 - MOON_R - 30_000, 0, 0);
    const { point, clamped } = clampOutsideBodies([moon], inside);
    expect(clamped).toBe(true);
    expect(length(sub(point, moon.position))).toBeGreaterThanOrEqual(safetyRadius(MOON_R));
    // Moved straight out, toward the side it was on.
    expect(point.x).toBeLessThan(inside.x);
    expect(clampOutsideBodies([moon], v3(0, 0, 0)).clamped).toBe(false);
  });

  it("burn to a point inside an asteroid's zone, on its far side: stops at the edge without crossing it", () => {
    const AST_R = 11_000;
    const world = makeWorld([makeShip({ id: "ff" })]);
    world.bodies.push({ id: "ast", name: "AST", kind: "asteroid", position: v3(1_000_000, 0, 0), radius: AST_R });
    const target = v3(1_000_000 + AST_R + 2_000, 0, 0); // 2 km off the far side
    submit(world, "blue", { type: "burnTo", ship: "ff", point: target });
    const ship = world.ships[0];
    let closest = Infinity;
    let done = false;
    for (let i = 0; i < 3600 / DT && !done; i++) {
      step(world);
      closest = Math.min(closest, length(sub(ship.position, world.bodies[0].position)));
      done = world.events.some((e) => e.type === "orderComplete");
    }
    expect(done).toBe(true);
    expect(closest).toBeGreaterThan(AST_R * 1.3);
    expect(length(sub(ship.position, world.bodies[0].position))).toBeGreaterThan(safetyRadius(AST_R) - 100);
  });

  it("a ship already inside a safety zone still goes around the body itself", () => {
    const world = worldWithMoon(v3(0, 0, 0));
    // Start just inside the safety zone on one side, target on the far side.
    const start = v3(-(MOON_R + 50_000), 0, 0);
    world.ships[0].position = start;
    const r = routeAim(world, start, v3(3_000_000, 0, 0));
    expect(r.detour).toBe(true);
    const { closest, doneTick } = run(world, { type: "burnTo", ship: "ff", point: v3(3_000_000, 0, 0) });
    expect(doneTick).not.toBeNull();
    expect(closest).toBeGreaterThan(MOON_R * 1.05);
    expect(closest).toBeGreaterThan(hardRadius(MOON_R) * 0.9);
  });
});
