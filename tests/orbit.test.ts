import { describe, expect, it } from "vitest";
import { bodyMu } from "../src/sim/gravity";
import { Predictor } from "../src/sim/predict";
import { DT, step, submit } from "../src/sim/sim";
import { cross, dot, length, normalize, sub } from "../src/sim/vec3";
import type { Body, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const MOON: Body = { id: "moon", name: "MOON", kind: "moon", position: v3(0, 0, 0), radius: 1_100_000 };

function orbitWorld(shipPos = v3(-3_000_000, 1_000_000, 400_000), shipVel = v3(0, 0, 0), body: Body = MOON): World {
  const world = makeWorld([makeShip({ id: "ff", position: shipPos, velocity: shipVel })]);
  world.bodies.push(body);
  return world;
}

function runToInsertion(world: World, limitS = 6 * 3600): number | null {
  for (let i = 0; i < limitS / DT; i++) {
    step(world);
    if (world.events.some((e) => e.type === "orderComplete" && e.ship === "ff")) return world.tick;
  }
  return null;
}

describe("orbit order", () => {
  it("from rest: flies out, ends in a circular orbit with the drive off, and stays there", () => {
    const world = orbitWorld();
    submit(world, "blue", { type: "orbit", ship: "ff", target: { kind: "object", id: "moon" } });
    expect(runToInsertion(world)).not.toBeNull();
    const ship = world.ships[0];
    const order = ship.order!;
    if (order.type !== "orbit") throw new Error("expected orbit order");
    const R = order.radius;
    const vc = Math.sqrt(bodyMu(MOON) / R);
    expect(Math.abs(length(ship.position) - R) / R).toBeLessThan(0.01);
    expect(Math.abs(length(ship.velocity) - vc) / vc).toBeLessThan(0.005);
    expect(R).toBeGreaterThan(MOON.radius);
    expect(ship.nav.phase).toBe("orbit");

    // Two more laps: radius steady, drive almost never lit.
    const period = 2 * Math.PI * Math.sqrt(R ** 3 / bodyMu(MOON));
    let burningTicks = 0, ticks = 0, worst = 0;
    for (let i = 0; i < (2 * period) / DT; i++) {
      step(world);
      ticks++;
      if (ship.thrust > 0) burningTicks++;
      worst = Math.max(worst, Math.abs(length(ship.position) - R) / R);
    }
    expect(worst).toBeLessThan(0.01);
    expect(burningTicks / ticks).toBeLessThan(0.01);
  });

  it("follows the direction the ship is already moving around the body", () => {
    // Moving "up" (+z) past the moon on the -x side: angular momentum along -y... any tilted plane.
    const world = orbitWorld(v3(-2_000_000, 0, 0), v3(0, 300, 600));
    const h = normalize(cross(world.ships[0].position, world.ships[0].velocity));
    submit(world, "blue", { type: "orbit", ship: "ff", target: { kind: "object", id: "moon" } });
    step(world);
    const order = world.ships[0].order!;
    if (order.type !== "orbit") throw new Error("expected orbit order");
    expect(dot(order.normal, h)).toBeCloseTo(1, 6);
    expect(runToInsertion(world)).not.toBeNull();
    const ship = world.ships[0];
    expect(dot(normalize(cross(ship.position, ship.velocity)), h)).toBeGreaterThan(0.99);
  });

  it("orbits a low-gravity asteroid closely without touching it", () => {
    const ast: Body = { id: "moon", name: "AST", kind: "asteroid", position: v3(0, 0, 0), radius: 11_000 };
    const world = orbitWorld(v3(-200_000, 50_000, 0), v3(0, 0, 0), ast);
    submit(world, "blue", { type: "orbit", ship: "ff", target: { kind: "object", id: "moon" } });
    let closest = Infinity;
    let done = false;
    for (let i = 0; i < (8 * 3600) / DT && !done; i++) {
      step(world);
      closest = Math.min(closest, length(world.ships[0].position));
      done = world.events.some((e) => e.type === "orderComplete");
    }
    expect(done).toBe(true);
    expect(closest).toBeGreaterThan(11_000 * 1.25);
    expect(length(world.ships[0].position)).toBeLessThan(11_000 * 2.5); // close orbit
  });

  it("is rejected for anything but a body", () => {
    const world = orbitWorld();
    world.ships.push(makeShip({ id: "other", faction: "red", position: v3(5e6, 0, 0) }));
    submit(world, "blue", { type: "orbit", ship: "ff", target: { kind: "track", id: "other" } });
    step(world);
    expect(world.ships[0].order).toBeNull();
    expect(world.events).toContainEqual(expect.objectContaining({ type: "commandRejected", reason: "orbit needs a body" }));
  });

  it("the predicted insertion matches the real one", () => {
    const world = orbitWorld();
    submit(world, "blue", { type: "orbit", ship: "ff", target: { kind: "object", id: "moon" } });
    step(world);
    const p = new Predictor(world, "ff", 6 * 3600);
    while (!p.run(5000));
    expect(p.result.arrival).not.toBeNull();
    const start = world.tick;
    const done = runToInsertion(world);
    expect((done! - start) * DT).toBeCloseTo(p.result.arrival!.t, 6);
    expect(length(sub(world.ships[0].position, p.result.arrival!.position))).toBeLessThan(1);
  });
});
