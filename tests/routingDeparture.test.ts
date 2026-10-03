// Routes that leave an orbit or a parked position near a body must go around it, never
// through it (playtest bug, 2026-10-03). These cases start with the ship close to a body,
// often with momentum, and the destination on or past the far side.

import { describe, expect, it } from "vitest";
import { cruiseAccel, hardRadius, routeAim, safetyRadius } from "../src/sim/autopilot";
import type { Command } from "../src/sim/commands";
import { bodyMu } from "../src/sim/gravity";
import { DT, step, submit } from "../src/sim/sim";
import { add, length, scale, sub, type Vec3 } from "../src/sim/vec3";
import type { Body, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const MOON: Body = { id: "b", name: "MOON", kind: "moon", position: v3(0, 0, 0), radius: 1_100_000 };
const ROCK: Body = { id: "b", name: "ROCK", kind: "asteroid", position: v3(0, 0, 0), radius: 11_000 };

/** A world with the ship in a circular orbit (as the Orbit order leaves it) at the given phase. */
function inOrbit(body: Body, phase: number): World {
  const world = makeWorld([makeShip({ id: "ff" })]);
  world.bodies.push(body);
  const ship = world.ships[0];
  const R = safetyRadius(body, cruiseAccel(ship)) * 1.15;
  const vc = Math.sqrt(bodyMu(body) / R);
  ship.position = v3(R * Math.cos(phase), R * Math.sin(phase), 0);
  ship.velocity = v3(-vc * Math.sin(phase), vc * Math.cos(phase), 0);
  ship.heading = v3(0, 1, 0);
  ship.order = { type: "orbit", target: { kind: "object", id: "b" }, radius: R, normal: v3(0, 0, 1), entry: { ...ship.position } };
  ship.nav.orbitStage = "orbit";
  return world;
}

/** Runs the order to completion (or the time limit); closest approach to the body's center. */
function closestDuring(world: World, command: Command, limitS = 3 * 3600): { closest: number; alive: boolean; done: boolean } {
  submit(world, "blue", command);
  const ship = world.ships[0];
  let closest = Infinity;
  for (let i = 0; i < limitS / DT; i++) {
    step(world);
    if (!world.ships.includes(ship)) return { closest: 0, alive: false, done: false };
    closest = Math.min(closest, length(sub(ship.position, world.bodies[0].position)));
    if (world.events.some((e) => e.type === "orderComplete" && e.ship === "ff")) return { closest, alive: true, done: true };
  }
  return { closest, alive: true, done: false };
}

const PHASES = Array.from({ length: 8 }, (_, k) => (k / 8) * 2 * Math.PI);

describe("leaving an orbit", () => {
  it("rendezvous with a fast target beyond an asteroid never enters the rock's hard limit", () => {
    for (const phase of PHASES) {
      const world = inOrbit(ROCK, phase);
      world.ships.push(makeShip({ id: "tgt", faction: "red", position: v3(1_500_000, 1_200_000, 300_000), velocity: v3(-1100, 450, -60) }));
      const r = closestDuring(world, { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "rendezvous" });
      expect(r.alive).toBe(true);
      expect(r.closest, `phase ${phase.toFixed(2)}`).toBeGreaterThan(hardRadius(ROCK));
    }
  });

  it("fast pass and rendezvous on a target behind the moon go around it", () => {
    for (const phase of PHASES) {
      for (const mode of ["fastPass", "rendezvous"] as const) {
        const world = inOrbit(MOON, phase);
        world.ships.push(makeShip({ id: "tgt", faction: "red", position: v3(-4_000_000, 0, 200_000), velocity: v3(0, 300, 0) }));
        const r = closestDuring(world, { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode, g: "max" });
        expect(r.alive).toBe(true);
        expect(r.closest, `${mode} phase ${phase.toFixed(2)}`).toBeGreaterThan(hardRadius(MOON));
      }
    }
  });

  it("burn to the point opposite the ship, behind the body, goes around", () => {
    for (const body of [MOON, ROCK]) {
      for (const phase of PHASES) {
        const world = inOrbit(body, phase);
        const opposite = scale(world.ships[0].position, -3);
        const r = closestDuring(world, { type: "burnTo", ship: "ff", point: opposite, g: "combat" });
        expect(r.done, `${body.kind} phase ${phase.toFixed(2)}`).toBe(true);
        expect(r.closest, `${body.kind} phase ${phase.toFixed(2)}`).toBeGreaterThan(hardRadius(body));
      }
    }
  });
});

describe("leaving a parked position", () => {
  it("from the edge of a zone to the far side: both legs of the route clear the zone", () => {
    const world = makeWorld([makeShip({ id: "ff" })]);
    world.bodies.push(MOON);
    const R = safetyRadius(MOON, cruiseAccel(world.ships[0]));
    for (const ang of [0, 0.3, 0.8]) {
      const from = v3(-R * 1.001 * Math.cos(ang), R * 1.001 * Math.sin(ang), 0);
      const goal = v3(3 * R, 0, 0);
      const route = routeAim(world, from, goal, cruiseAccel(world.ships[0]));
      expect(route.detour).toBe(true);
      expect(segmentClearance(from, route.aim, MOON.position)).toBeGreaterThan(R * 0.999);
      expect(length(sub(route.aim, MOON.position))).toBeLessThan(10 * R); // a sensible turning point, not far off
    }
  });

  it("parked at the zone edge, burn and fast pass to the far side never enter the body", () => {
    for (const body of [MOON, ROCK]) {
      for (const ang of [0, 0.5, 1.5]) {
        for (const kind of ["burnTo", "fastPass"] as const) {
          const world = makeWorld([makeShip({ id: "ff" })]);
          world.bodies.push(body);
          const R = safetyRadius(body, cruiseAccel(world.ships[0]));
          world.ships[0].position = v3(-R * 1.001 * Math.cos(ang), R * 1.001 * Math.sin(ang), 0);
          const goal = v3(4 * R, 0, 0);
          let cmd: Command;
          if (kind === "burnTo") cmd = { type: "burnTo", ship: "ff", point: goal };
          else {
            world.ships.push(makeShip({ id: "tgt", faction: "red", position: goal }));
            cmd = { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode: "fastPass", g: "max" };
          }
          const r = closestDuring(world, cmd);
          expect(r.done, `${body.kind} ${kind} ${ang}`).toBe(true);
          expect(r.closest, `${body.kind} ${kind} ${ang}`).toBeGreaterThan(hardRadius(body));
        }
      }
    }
  });
});

describe("momentum toward a body", () => {
  it("a fast ship heading straight at an asteroid with the target beyond swerves around it", () => {
    for (const mode of ["fastPass", "rendezvous"] as const) {
      // 600 km out at 5 km/s: about two minutes to impact, enough to swerve at Cruise G.
      const world = makeWorld([makeShip({ id: "ff", position: v3(-600_000, 2_000, 0), velocity: v3(5_000, 0, 0) })]);
      world.bodies.push(ROCK);
      world.ships.push(makeShip({ id: "tgt", faction: "red", position: v3(600_000, 0, 0) }));
      const r = closestDuring(world, { type: "intercept", ship: "ff", target: { kind: "track", id: "tgt" }, mode });
      expect(r.alive, mode).toBe(true);
      expect(r.closest, mode).toBeGreaterThan(hardRadius(ROCK));
    }
  });

  it("a burn whose target lies just past the moon, starting fast toward it, never enters it", () => {
    const world = makeWorld([makeShip({ id: "ff", position: v3(-3_000_000, 50_000, 0), velocity: v3(4_000, 0, 0) })]);
    world.bodies.push(MOON);
    const r = closestDuring(world, { type: "burnTo", ship: "ff", point: v3(2_500_000, 0, 0) }, 4 * 3600);
    expect(r.done).toBe(true);
    expect(r.closest).toBeGreaterThan(hardRadius(MOON));
  });
});

function segmentClearance(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, (ab.x * (c.x - a.x) + ab.y * (c.y - a.y) + ab.z * (c.z - a.z)) / (ab.x ** 2 + ab.y ** 2 + ab.z ** 2)));
  return length(sub(c, add(a, scale(ab, t))));
}
