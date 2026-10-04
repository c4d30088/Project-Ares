import { describe, expect, it } from "vitest";
import { railgunTuning as RT } from "../src/data/weapons";
import type { SimEvent } from "../src/sim/commands";
import { DT, step, submit } from "../src/sim/sim";
import type { Target } from "../src/sim/target";
import { length, normalize, sub, type Vec3 } from "../src/sim/vec3";
import { aimRailgun, pathClosest, predictSlugPath } from "../src/sim/weapons/railgun";
import type { Body, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

/** Our frigate at the origin, bow toward +x; a red frigate where given. */
function range(tgtPos: Vec3, tgtVel = v3(0, 0, 0)): World {
  return makeWorld([makeShip({ id: "ff", heading: v3(1, 0, 0) }), makeShip({ id: "tgt", faction: "red", position: tgtPos, velocity: tgtVel })]);
}

const fire = (world: World, target: Target = { kind: "track", id: "tgt" }) => submit(world, "blue", { type: "fireRailgun", ship: "ff", target });

function runFor(world: World, s: number, stop?: (ev: SimEvent[]) => boolean) {
  const all: (SimEvent & { t: number })[] = [];
  for (let i = 0; i < s / DT; i++) {
    step(world);
    for (const e of world.events) all.push({ ...e, t: world.tick * DT });
    if (stop?.(world.events)) break;
  }
  return all;
}

describe("railgun aim", () => {
  it("leads a coasting ship 1,000 km away and hits it when predicted", () => {
    const world = range(v3(1_000_000, 200_000, 50_000), v3(-300, 800, 100));
    const aim = aimRailgun(world, world.ships[0], { kind: "track", id: "tgt" })!;
    fire(world);
    const ev = runFor(world, 200, (e) => e.some((x) => x.type === "slugHit"));
    const hit = ev.find((e) => e.type === "slugHit");
    expect(hit).toMatchObject({ hit: "tgt" });
    expect(Math.abs(hit!.t - DT - aim.t)).toBeLessThan(0.2);
  });

  it("allows for gravity bending the slug past a moon", () => {
    const moon: Body = { id: "moon", name: "MOON", kind: "moon", position: v3(1_500_000, 900_000, 0), radius: 600_000 };
    const world = range(v3(3_000_000, 0, 0), v3(0, 500, 0));
    world.bodies.push(moon);
    // The pull is real: an unaimed straight shot would miss by far more than a hull.
    const straight = predictSlugPath(world.bodies, v3(0, 0, 0), v3(20_000, 0, 0), 160);
    expect(Math.abs(straight.points[straight.points.length - 1].position.y)).toBeGreaterThan(1_000);
    fire(world);
    const ev = runFor(world, 300, (e) => e.some((x) => x.type === "slugHit"));
    expect(ev.find((e) => e.type === "slugHit")).toMatchObject({ hit: "tgt" });
  });

  it("a target that changes course after the shot is missed", () => {
    const world = range(v3(1_000_000, 0, 0));
    fire(world);
    step(world);
    submit(world, "red", { type: "burnTo", ship: "tgt", point: v3(1_000_000, 3_000_000, 0), g: "combat" });
    const ev = runFor(world, 120);
    expect(ev.some((e) => e.type === "slugHit")).toBe(false);
  });

  it("a shot at a point passes through it", () => {
    const world = range(v3(50_000_000, 0, 0));
    const point = v3(400_000, 150_000, -60_000);
    fire(world, { kind: "point", position: point });
    step(world);
    const s = world.slugs[0];
    const path = predictSlugPath(world.bodies, s.shot.origin, s.shot.velocity, 60, 0.05);
    expect(pathClosest(path.points, point, v3(0, 0, 0)).dist).toBeLessThan(50);
  });

  it("the predicted path from the shot matches the slug's real flight", () => {
    const moon: Body = { id: "moon", name: "MOON", kind: "moon", position: v3(800_000, 500_000, 0), radius: 300_000 };
    const world = range(v3(2_000_000, 0, 0));
    world.bodies.push(moon);
    fire(world);
    step(world);
    const s = world.slugs[0];
    const path = predictSlugPath(world.bodies, s.shot.origin, s.shot.velocity, 60, 10);
    for (const p of path.points.slice(1, 6)) {
      while (world.slugs[0].ageS < p.t - 1e-9) step(world);
      expect(length(sub(world.slugs[0].position, p.position))).toBeLessThan(5);
    }
  });
});

describe("railgun limits", () => {
  it("recharges between shots and runs out of slugs", () => {
    const world = range(v3(500_000, 0, 0));
    fire(world);
    step(world);
    fire(world);
    const ev = runFor(world, 0.1);
    expect(ev.find((e) => e.type === "commandRejected")).toMatchObject({ reason: expect.stringMatching(/^recharging/) });
    runFor(world, RT.light.rechargeS);
    fire(world);
    expect(runFor(world, 0.1).some((e) => e.type === "railgunFired")).toBe(true);
    world.ships[0].weapons.slugs = 0;
    runFor(world, RT.light.rechargeS);
    fire(world);
    expect(runFor(world, 0.1).find((e) => e.type === "commandRejected")).toMatchObject({ reason: "out of slugs" });
  });

  it("the light turret cannot fire behind the ship", () => {
    const world = range(v3(-500_000, 0, 0));
    fire(world);
    expect(runFor(world, 0.1).find((e) => e.type === "commandRejected")).toMatchObject({ reason: "out of arc" });
  });

  it("a spinal gun fires only when the bow is on the target", () => {
    const world = makeWorld([
      makeShip({ id: "cr", shipClass: "cruiser", heading: v3(0, 1, 0) }),
      makeShip({ id: "tgt", faction: "red", position: v3(800_000, 0, 0) }),
    ]);
    submit(world, "blue", { type: "fireRailgun", ship: "cr", target: { kind: "track", id: "tgt" } });
    expect(runFor(world, 0.1).find((e) => e.type === "commandRejected")).toMatchObject({ reason: "turn the ship to aim" });
    const aim = aimRailgun(world, world.ships[0], { kind: "track", id: "tgt" })!;
    world.ships[0].heading = normalize(aim.velocity);
    submit(world, "blue", { type: "fireRailgun", ship: "cr", target: { kind: "track", id: "tgt" } });
    expect(runFor(world, 0.1).some((e) => e.type === "railgunFired")).toBe(true);
  });
});

describe("slug hits", () => {
  it("a hit from ahead strikes the target's front", () => {
    const world = range(v3(300_000, 0, 0));
    world.ships[1].heading = v3(-1, 0, 0); // facing us
    fire(world);
    const ev = runFor(world, 60, (e) => e.some((x) => x.type === "slugHit"));
    expect(ev.find((e) => e.type === "damage" && e.ship === "tgt")).toMatchObject({ side: "front" });
  });

  it("PDCs on Auto shoot down some incoming slugs, not all", () => {
    let killed = 0, hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const world = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "gun", faction: "red", position: v3(200_000, 0, 0), heading: v3(-1, 0, 0) })]);
      for (const m of world.ships[0].weapons.pdcs) m.mode = "auto";
      world.rngState = seed * 7919;
      submit(world, "red", { type: "fireRailgun", ship: "gun", target: { kind: "track", id: "ff" } });
      const ev = runFor(world, 30, (e) => e.some((x) => x.type === "slugHit"));
      if (ev.some((e) => e.type === "pdcKill")) killed++;
      if (ev.some((e) => e.type === "slugHit")) hits++;
    }
    expect(killed).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(0);
  });

  it("the same seed gives the same result", () => {
    const run = () => {
      const world = range(v3(400_000, 100_000, 0), v3(0, -200, 0));
      for (const m of world.ships[1].weapons.pdcs) m.mode = "auto";
      fire(world);
      runFor(world, 60);
      return JSON.stringify(world);
    };
    expect(run()).toBe(run());
  });
});
