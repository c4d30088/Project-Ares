// Impact prediction for the intercept lines must match the real flight.

import { describe, expect, it } from "vitest";
import type { LaunchMode } from "../src/sim/world";
import { DT, step, submit } from "../src/sim/sim";
import { predictImpact } from "../src/sim/weapons/torpedo";
import { length, sub, type Vec3 } from "../src/sim/vec3";
import { makeShip, makeWorld, v3 } from "./helpers";

/** Fires one torpedo at a coasting ship; records predictions every `every` seconds and the real hit. */
function fly(tgtPos: Vec3, tgtVel: Vec3, mode: LaunchMode = "hot", shooterVel = v3(0, 0, 0), every = 10) {
  const world = makeWorld([
    makeShip({ id: "ff", velocity: shooterVel }),
    makeShip({ id: "tgt", faction: "red", position: tgtPos, velocity: tgtVel }),
  ]);
  submit(world, "blue", { type: "launchTorpedoes", ship: "ff", target: { kind: "track", id: "tgt" }, count: 1, mode });
  const preds: { at: number; t: number; position: Vec3 }[] = [];
  let hit: { t: number; position: Vec3 } | null = null;
  for (let i = 0; i < 3600 / DT && !hit; i++) {
    step(world);
    const now = world.tick * DT;
    const torp = world.torpedoes[0];
    if (torp && i % Math.round(every / DT) === 0) {
      const p = predictImpact(world, torp);
      if (p) preds.push({ at: now, t: now + p.t, position: p.position });
    }
    if (world.events.some((e) => e.type === "torpedoDetonated")) {
      hit = { t: now, position: { ...world.ships.find((s) => s.id === "tgt")!.position } };
    }
  }
  return { preds, hit };
}

describe("torpedo impact prediction", () => {
  it("hot launch at a coasting ship: the countdown and the X match the real hit", () => {
    const { preds, hit } = fly(v3(4_000_000, 1_000_000, 300_000), v3(-400, 900, 0));
    expect(hit).not.toBeNull();
    const range = 4_100_000;
    // From the first second: within 5% of the flight time and 2% of the range.
    const first = preds[0];
    expect(Math.abs(first.t - hit!.t)).toBeLessThan(0.05 * hit!.t);
    expect(length(sub(first.position, hit!.position))).toBeLessThan(0.02 * range);
    // After the boost: within a second and a kilometer.
    for (const p of preds.filter((q) => q.at > 60)) {
      expect(Math.abs(p.t - hit!.t)).toBeLessThan(1);
      expect(length(sub(p.position, hit!.position))).toBeLessThan(1000);
    }
  });

  it("at a point: the countdown matches the arrival there", () => {
    const world = makeWorld([makeShip({ id: "ff" })]);
    const point = v3(2_500_000, -800_000, 0);
    submit(world, "blue", { type: "launchTorpedoes", ship: "ff", target: { kind: "point", position: point }, count: 1, mode: "hot" });
    let predicted: number | null = null;
    let arrived: number | null = null;
    for (let i = 0; i < 3600 / DT && arrived === null; i++) {
      step(world);
      const t = world.torpedoes[0];
      if (!t) continue;
      if (predicted === null) predicted = world.tick * DT + predictImpact(world, t)!.t;
      if (length(sub(t.position, point)) < 1000 && length(t.velocity) < 50) arrived = world.tick * DT;
    }
    expect(arrived).not.toBeNull();
    expect(Math.abs(predicted! - arrived!)).toBeLessThan(0.1 * arrived!);
  });

  it("cold launch: the countdown includes the dark coast before ignition", () => {
    const { preds, hit } = fly(v3(6_000_000, 0, 0), v3(0, 300, 0), "cold", v3(5_000, 0, 0));
    expect(hit).not.toBeNull();
    expect(Math.abs(preds[0].t - hit!.t)).toBeLessThan(0.05 * hit!.t);
  });
});

describe("torpedo path ghost run", () => {
  it("ends at the real impact, at the same moment, and bends around a body in the way", async () => {
    const { TorpedoPredictor } = await import("../src/sim/weapons/torpedoPredict");
    const { cruiseAccel, hardRadius, safetyRadius } = await import("../src/sim/autopilot");
    const world = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "tgt", faction: "red", position: v3(1_500_000, 50_000, 0), velocity: v3(0, 200, 0) })]);
    const rock = { id: "rock", name: "ROCK", kind: "asteroid" as const, position: v3(0, 0, 0), radius: 11_000 };
    world.bodies.push(rock);
    world.ships[0].position = v3(-safetyRadius(rock, cruiseAccel(world.ships[0])) * 1.001, 0, 0);
    submit(world, "blue", { type: "launchTorpedoes", ship: "ff", target: { kind: "track", id: "tgt" }, count: 1, mode: "hot" });
    step(world);
    const ghost = new TorpedoPredictor(world, world.torpedoes[0].id, 1800);
    while (!ghost.run(2000));
    const start = world.tick;
    let hitAt: number | null = null;
    for (let i = 0; i < 1800 / DT && hitAt === null; i++) {
      step(world);
      if (world.events.some((e) => e.type === "torpedoDetonated")) hitAt = (world.tick - start) * DT;
    }
    expect(ghost.result.end?.kind).toBe("impact");
    expect(ghost.result.end!.t).toBeCloseTo(hitAt!, 6);
    // The drawn path stays outside the rock.
    for (const p of ghost.result.points) expect(length(sub(p.position, rock.position))).toBeGreaterThan(hardRadius(rock));
    // ... and is not a straight line: it passes well off the line through the rock.
    const maxOff = Math.max(...ghost.result.points.map((p) => Math.abs(p.position.y)));
    expect(maxOff).toBeGreaterThan(hardRadius(rock));
  });
});
