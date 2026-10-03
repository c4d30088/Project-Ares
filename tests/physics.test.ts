import { describe, expect, it } from "vitest";
import { angleBetween, integrate, slerpToward } from "../src/sim/physics";
import { DT, step, submit, TICK_RATE } from "../src/sim/sim";
import { loadScenario, type Scenario } from "../src/sim/scenario";
import holotableTest from "../src/data/scenarios/holotable-test.json";
import { makeShip, makeWorld, v3 } from "./helpers";

describe("integration", () => {
  it("is exact for constant acceleration", () => {
    const p = v3(10, -5, 2), v = v3(100, 0, -3), a = v3(2, -1, 0.5);
    const steps = 1000;
    for (let i = 0; i < steps; i++) integrate(p, v, a, DT);
    const t = steps * DT;
    expect(p.x).toBeCloseTo(10 + 100 * t + 0.5 * 2 * t * t, 6);
    expect(p.y).toBeCloseTo(-5 - 0.5 * t * t, 6);
    expect(p.z).toBeCloseTo(2 - 3 * t + 0.5 * 0.5 * t * t, 6);
    expect(v.x).toBeCloseTo(100 + 2 * t, 9);
  });

  it("a coasting ship moves in a straight line at constant speed", () => {
    const ship = makeShip({ id: "a", velocity: v3(1500, 300, -20) });
    const world = makeWorld([ship]);
    for (let i = 0; i < 20 * TICK_RATE; i++) step(world);
    expect(ship.position.x).toBeCloseTo(1500 * 20, 6);
    expect(ship.position.y).toBeCloseTo(300 * 20, 6);
    expect(ship.position.z).toBeCloseTo(-20 * 20, 6);
    expect(ship.thrust).toBe(0);
  });
});

describe("attitude", () => {
  it("slerpToward never turns more than the limit and lands exactly on target", () => {
    const from = v3(1, 0, 0), to = v3(0, 1, 0);
    const a = slerpToward(from, to, 0.1);
    expect(angleBetween(from, a)).toBeCloseTo(0.1, 9);
    expect(slerpToward(from, to, 2)).toEqual(to);
  });

  it("handles an exact 180° reversal", () => {
    const r = slerpToward(v3(1, 0, 0), v3(-1, 0, 0), 0.1);
    expect(angleBetween(v3(1, 0, 0), r)).toBeCloseTo(0.1, 9);
  });

  it("a frigate flips 180° in its class flip time (12 s)", () => {
    const ship = makeShip({ id: "a", heading: v3(1, 0, 0) });
    const world = makeWorld([ship]);
    submit(world, "blue", { type: "orient", ship: "a", target: { kind: "point", position: v3(-1e6, 0, 0) } });
    let ticks = 0;
    while (angleBetween(ship.heading, v3(-1, 0, 0)) > 1e-9 && ticks < 10000) {
      step(world);
      ticks++;
    }
    // The command applies at the start of the first step, so turning starts immediately.
    expect(ticks * DT).toBeCloseTo(12, 6);
    expect(ship.thrust).toBe(0);
  });
});

describe("commands", () => {
  it("apply at the start of the next tick", () => {
    const ship = makeShip({ id: "a" });
    const world = makeWorld([ship]);
    submit(world, "blue", { type: "setG", ship: "a", g: "max" });
    expect(ship.g).toBe("cruise");
    step(world);
    expect(ship.g).toBe("max");
  });

  it("are rejected for another faction's ship", () => {
    const ship = makeShip({ id: "a", faction: "red" });
    const world = makeWorld([ship]);
    submit(world, "blue", { type: "setG", ship: "a", g: "max" });
    step(world);
    expect(ship.g).toBe("cruise");
    expect(world.events).toContainEqual(expect.objectContaining({ type: "commandRejected", reason: "not your ship" }));
  });
});

describe("determinism", () => {
  it("same scenario and commands give an identical end state", () => {
    const run = () => {
      const world = loadScenario(holotableTest as Scenario);
      for (let i = 0; i < 3000; i++) {
        if (i === 500) submit(world, "blue", { type: "coast", ship: "blue-dd3" });
        if (i === 900) submit(world, "blue", { type: "orient", ship: "blue-cv2", target: { kind: "object", id: "moon-1" } });
        step(world);
      }
      return world;
    };
    expect(run()).toEqual(run());
  });
});
