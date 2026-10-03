import { describe, expect, it } from "vitest";
import { Predictor } from "../src/sim/predict";
import { DT, step, submit } from "../src/sim/sim";
import { makeShip, makeWorld, v3 } from "./helpers";

describe("ghost-run prediction", () => {
  it("matches what actually happens: same flip time, arrival time and arrival point", () => {
    const ship = makeShip({ id: "ff", velocity: v3(300, -800, 50) });
    const world = makeWorld([ship, makeShip({ id: "other", faction: "red", velocity: v3(1000, 0, 0) })]);
    submit(world, "blue", { type: "burnTo", ship: "ff", point: v3(5_000_000, 1_000_000, 2_000_000), g: "cruise" });
    step(world); // order applied

    const p = new Predictor(world, "ff", 4 * 3600);
    while (!p.run(5000));
    const pred = p.result;
    expect(pred.flip).not.toBeNull();
    expect(pred.arrival).not.toBeNull();

    // Now run the real world and compare.
    const start = world.tick;
    let flipT: number | null = null;
    let arrivalT: number | null = null;
    while (arrivalT === null && world.tick - start < (4 * 3600) / DT) {
      step(world);
      for (const e of world.events) {
        const t = (world.tick - start) * DT;
        if (e.type === "flipStart" && e.ship === "ff" && flipT === null) flipT = t;
        if (e.type === "orderComplete" && e.ship === "ff") arrivalT = t;
      }
    }
    expect(flipT).toBeCloseTo(pred.flip!.t, 6);
    expect(arrivalT).toBeCloseTo(pred.arrival!.t, 6);
    expect(ship.position.x).toBeCloseTo(pred.arrival!.position.x, 3);
    expect(ship.position.y).toBeCloseTo(pred.arrival!.position.y, 3);
    expect(ship.position.z).toBeCloseTo(pred.arrival!.position.z, 3);
  });

  it("does not change the real world", () => {
    const ship = makeShip({ id: "ff" });
    const world = makeWorld([ship]);
    submit(world, "blue", { type: "burnTo", ship: "ff", point: v3(1_000_000, 0, 0) });
    step(world);
    const before = structuredClone(world);
    const p = new Predictor(world, "ff", 3600);
    while (!p.run(5000));
    expect(world).toEqual(before);
  });

  it("marks burning and coasting stretches of the path", () => {
    const ship = makeShip({ id: "ff" });
    const world = makeWorld([ship]);
    submit(world, "blue", { type: "burnTo", ship: "ff", point: v3(2_000_000, 0, 0) });
    step(world);
    const p = new Predictor(world, "ff", 3600);
    while (!p.run(5000));
    const pts = p.result.points;
    // burn, coast during the flip, then burn (brake)
    const changes = pts.filter((pt, i) => i > 0 && pt.burning !== pts[i - 1].burning).length;
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(pts.some((pt) => !pt.burning && pt.t > p.result.flip!.t && pt.t < p.result.flip!.t + 12)).toBe(true);
  });
});
