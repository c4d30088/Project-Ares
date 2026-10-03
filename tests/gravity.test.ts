import { afterEach, describe, expect, it } from "vitest";
import { physicsTuning } from "../src/data/physics";
import { bodyMu, gravityAt } from "../src/sim/gravity";
import { DT, step, submit } from "../src/sim/sim";
import { cross, dot, length, sub } from "../src/sim/vec3";
import type { Body } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const MOON: Body = { id: "m", name: "M", kind: "moon", position: v3(0, 0, 0), radius: 1_100_000 };

afterEach(() => {
  physicsTuning.gravityEnabled = true;
});

describe("gravity", () => {
  it("pulls toward the body with mu / r²", () => {
    const g = gravityAt([MOON], v3(2_000_000, 0, 0));
    expect(g.x).toBeCloseTo(-bodyMu(MOON) / 4e12, 9);
    expect(g.y).toBe(0);
    // A moon like VESSIK pulls roughly 0.1 g at its surface.
    expect(length(gravityAt([MOON], v3(MOON.radius, 0, 0)))).toBeGreaterThan(0.8);
    expect(length(gravityAt([MOON], v3(MOON.radius, 0, 0)))).toBeLessThan(1.3);
  });

  it("a ship dropped from rest falls toward the body at the local rate", () => {
    const ship = makeShip({ id: "a", position: v3(3_000_000, 0, 0) });
    const world = makeWorld([ship]);
    world.bodies.push(MOON);
    const g = length(gravityAt([MOON], ship.position));
    for (let i = 0; i < 100; i++) step(world); // 5 s
    expect(ship.velocity.x).toBeCloseTo(-g * 5, 1);
  });

  it("a circular orbit stays circular for several laps (energy and radius steady)", () => {
    const R = 1_500_000;
    const mu = bodyMu(MOON);
    const vc = Math.sqrt(mu / R);
    const ship = makeShip({ id: "a", position: v3(R, 0, 0), velocity: v3(0, vc, 0) });
    const world = makeWorld([ship]);
    world.bodies.push(MOON);
    const energy = () => 0.5 * dot(ship.velocity, ship.velocity) - mu / length(ship.position);
    const e0 = energy();
    const period = 2 * Math.PI * Math.sqrt(R ** 3 / mu);
    let minR = Infinity, maxR = 0;
    for (let i = 0; i < (3 * period) / DT; i++) {
      step(world);
      const r = length(ship.position);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    }
    expect(Math.abs((energy() - e0) / e0)).toBeLessThan(1e-6);
    expect(maxR / minR).toBeLessThan(1.001);
    // Angular momentum stays along +z.
    expect(cross(ship.position, ship.velocity).z).toBeGreaterThan(0);
  });

  it("can be switched off", () => {
    physicsTuning.gravityEnabled = false;
    const ship = makeShip({ id: "a", position: v3(2_000_000, 0, 0) });
    const world = makeWorld([ship]);
    world.bodies.push(MOON);
    for (let i = 0; i < 100; i++) step(world);
    expect(length(ship.velocity)).toBe(0);
  });

  it("burn to a point near a moon still arrives at rest, then hovers against the pull", () => {
    const ship = makeShip({ id: "a" });
    const world = makeWorld([ship]);
    world.bodies.push({ ...MOON, position: v3(3_000_000, 0, 0) });
    const target = v3(3_000_000 - MOON.radius - 150_000, 0, 0); // 150 km above the surface
    submit(world, "blue", { type: "burnTo", ship: "a", point: target });
    let done = false;
    for (let i = 0; i < 3600 / DT && !done; i++) {
      step(world);
      done = world.events.some((e) => e.type === "orderComplete");
    }
    expect(done).toBe(true);
    expect(length(sub(ship.position, target))).toBeLessThan(50);
    for (let i = 0; i < 600 / DT; i++) step(world);
    expect(length(sub(ship.position, target))).toBeLessThan(1000); // held station
    expect(ship.thrust).toBeGreaterThan(0.5); // hovering against ~0.9 m/s² of pull
  });
});
