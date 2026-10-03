// Torpedoes go around bodies in the way instead of flying into them (playtest request,
// 2026-10-03). A torpedo aimed at a body still strikes it.

import { describe, expect, it } from "vitest";
import { cruiseAccel, safetyRadius } from "../src/sim/autopilot";
import type { SimEvent } from "../src/sim/commands";
import type { Target } from "../src/sim/target";
import { DT, step, submit } from "../src/sim/sim";
import { length, sub, type Vec3 } from "../src/sim/vec3";
import type { Body, LaunchMode, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const ROCK: Body = { id: "rock", name: "ROCK", kind: "asteroid", position: v3(0, 0, 0), radius: 11_000 };
const MOON: Body = { id: "moon", name: "MOON", kind: "moon", position: v3(1_200_000, 0, 0), radius: 600_000 };

function run(world: World, limitS = 1800) {
  const events: SimEvent[] = [];
  for (let i = 0; i < limitS / DT; i++) {
    step(world);
    events.push(...world.events);
    if (world.events.some((e) => e.type === "torpedoDetonated" || e.type === "torpedoExpired")) break;
    if (world.torpedoes.length === 0 && world.tick > 2) break;
  }
  return events;
}

const hitBody = (events: SimEvent[]) => events.some((e) => e.type === "destroyed" && e.cause.startsWith("collision"));

/** Blue ship parked on the rock's zone edge, on the side away from the target. */
function besideRock(targetPos: Vec3, angleDeg = 0): World {
  const world = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "tgt", faction: "red", position: targetPos })]);
  world.bodies.push(ROCK);
  const R = safetyRadius(ROCK, cruiseAccel(world.ships[0])) * 1.001;
  const a = (angleDeg * Math.PI) / 180;
  world.ships[0].position = v3(-R * Math.cos(a), R * Math.sin(a), 0);
  return world;
}

const fire = (world: World, target: Target, mode: LaunchMode = "hot", count = 1) =>
  submit(world, "blue", { type: "launchTorpedoes", ship: "ff", target, count, mode });

describe("torpedoes route around bodies", () => {
  it("launched from beside an asteroid at a target behind it: goes around and hits", () => {
    for (const ang of [0, 10, 40]) {
      for (const mode of ["hot", "cold"] as const) {
        const world = besideRock(v3(1_500_000, 0, 0), ang);
        fire(world, { kind: "track", id: "tgt" }, mode);
        const events = run(world);
        expect(hitBody(events), `${mode} ${ang}`).toBe(false);
        expect(events.some((e) => e.type === "torpedoDetonated" && e.hit === "tgt"), `${mode} ${ang}`).toBe(true);
      }
    }
  });

  it("a whole salvo from beside an asteroid gets around it", () => {
    const world = besideRock(v3(2_000_000, 300_000, 0));
    fire(world, { kind: "track", id: "tgt" }, "hot", 6);
    const events: SimEvent[] = [];
    for (let i = 0; i < 900 / DT && world.ships.some((s) => s.id === "tgt"); i++) {
      step(world);
      events.push(...world.events);
    }
    expect(hitBody(events)).toBe(false);
    expect(events.filter((e) => e.type === "torpedoDetonated").length).toBeGreaterThan(0);
  });

  it("a moon between the ship and the target: goes around and hits", () => {
    const world = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "tgt", faction: "red", position: v3(3_500_000, 100_000, 0) })]);
    world.bodies.push(MOON);
    fire(world, { kind: "track", id: "tgt" });
    const events = run(world);
    expect(hitBody(events)).toBe(false);
    expect(events.some((e) => e.type === "torpedoDetonated" && e.hit === "tgt")).toBe(true);
  });

  it("a target tucked close behind a moon may be out of reach, but the torpedo never hits the moon", () => {
    const world = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "tgt", faction: "red", position: v3(2_800_000, 100_000, 0) })]);
    world.bodies.push(MOON);
    fire(world, { kind: "track", id: "tgt" });
    expect(hitBody(run(world))).toBe(false);
  });

  it("to a point behind an asteroid: arrives there without touching it", () => {
    const world = besideRock(v3(50_000_000, 0, 0));
    const point = v3(300_000, 0, 0);
    fire(world, { kind: "point", position: point });
    let arrived = false;
    let crashed = false;
    for (let i = 0; i < 1800 / DT && !arrived && !crashed; i++) {
      step(world);
      crashed = hitBody(world.events);
      const t = world.torpedoes[0];
      if (t && length(sub(t.position, point)) < 60_000) arrived = true;
    }
    expect(crashed).toBe(false);
    expect(arrived).toBe(true);
  });

  it("aimed at the asteroid itself: still strikes it", () => {
    const world = besideRock(v3(50_000_000, 0, 0));
    world.ships[0].position = v3(-500_000, 0, 0);
    fire(world, { kind: "object", id: "rock" });
    const events = run(world);
    expect(events.find((e) => e.type === "destroyed")).toMatchObject({ cause: "collision with ROCK" });
  });
});
