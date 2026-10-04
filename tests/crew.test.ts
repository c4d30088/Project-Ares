import { describe, expect, it } from "vitest";
import { crewTuning as CT } from "../src/data/crew";
import { torpedoTuning as TT } from "../src/data/weapons";
import { turnRate } from "../src/sim/autopilot";
import { crewEfficiency } from "../src/sim/crew";
import { Predictor } from "../src/sim/predict";
import { DT, step, submit } from "../src/sim/sim";
import { scale } from "../src/sim/vec3";
import type { World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

/** A frigate burning straight ahead (a far burn-to point) at the given G setting. */
function burning(g: "cruise" | "combat" | "max"): World {
  const world = makeWorld([makeShip({ id: "ff" })]);
  submit(world, "blue", { type: "burnTo", ship: "ff", point: v3(1e12, 0, 0), g });
  return world;
}

const run = (world: World, s: number) => {
  const casualties: number[] = [];
  for (let i = 0; i < s / DT; i++) {
    step(world);
    for (const e of world.events) if (e.type === "crewCasualties") casualties.push(world.tick * DT);
  }
  return casualties;
};

describe("G-strain", () => {
  it("fills in about ten minutes at Combat G and five at Max G; none at Cruise G", () => {
    const combat = burning("combat");
    run(combat, CT.strainFillS * 0.98);
    expect(combat.ships[0].strain).toBeGreaterThan(0.9);
    expect(combat.ships[0].strain).toBeLessThan(1);

    const max = burning("max");
    run(max, CT.strainFillS / 2 + 20);
    expect(max.ships[0].strain).toBe(1);

    const cruise = burning("cruise");
    run(cruise, 600);
    expect(cruise.ships[0].strain).toBe(0);
  });

  it("drains while coasting", () => {
    const world = makeWorld([makeShip({ id: "ff", strain: 1 })]);
    run(world, CT.strainRecoverS / 2);
    expect(world.ships[0].strain).toBeCloseTo(0.5, 2);
    run(world, CT.strainRecoverS / 2 + 1);
    expect(world.ships[0].strain).toBe(0);
  });

  it("slows turns: half the turn rate at full strain", () => {
    const fresh = makeShip({ id: "a" });
    const strained = makeShip({ id: "b", strain: 1 });
    expect(turnRate(strained) / turnRate(fresh)).toBeCloseTo(CT.efficiencyAtFullStrain, 9);
    expect(crewEfficiency(makeShip({ id: "c", health: { ...fresh.health, crew: 0 } }))).toBeCloseTo(CT.efficiencyAtNoCrew, 9);
  });

  it("the route prediction allows for strain slowing the flip", () => {
    const world = makeWorld([makeShip({ id: "ff", strain: 0.95 })]);
    submit(world, "blue", { type: "burnTo", ship: "ff", point: v3(3_000_000, 1_000_000, 0), g: "max" });
    step(world);
    const p = new Predictor(world, "ff", 4 * 3600);
    while (!p.run(5000));
    const start = world.tick;
    let done: number | null = null;
    for (let i = 0; i < (4 * 3600) / DT && done === null; i++) {
      step(world);
      if (world.events.some((e) => e.type === "orderComplete")) done = (world.tick - start) * DT;
    }
    expect(done).not.toBeNull();
    expect(done!).toBeCloseTo(p.result.arrival!.t, 6);
  });

  it("holding full strain above Cruise G causes casualties; easing off stops them", () => {
    const world = burning("max");
    world.ships[0].strain = 1;
    const hits = run(world, 60);
    expect(hits.length).toBeGreaterThanOrEqual(Math.floor(60 / CT.casualtyIntervalS) - 1);
    expect(world.ships[0].health.crew).toBeLessThan(1);
    submit(world, "blue", { type: "setG", ship: "ff", g: "cruise" });
    expect(run(world, 60)).toHaveLength(0);
  });

  it("a strained crew's PDCs kill less", () => {
    // One torpedo hanging 10 km off (no drive), every PDC on Auto: how often is it dead in 1 s?
    const killedWithin1s = (strain: number) => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const world = makeWorld([makeShip({ id: "ff", strain, heading: v3(1, 0, 0) }), makeShip({ id: "red", faction: "red", position: v3(1e9, 0, 0) })]);
        for (const m of world.ships[0].weapons.pdcs) {
          m.mode = "auto";
          m.switchS = 0;
        }
        world.rngState = seed * 104729;
        world.torpedoes.push({
          id: "t", faction: "red", position: v3(10_000, 0, 0), velocity: scale(v3(1, 0, 0), 0), heading: v3(-1, 0, 0), thrust: 0,
          guidance: { target: { kind: "point", position: v3(10_000, 0, 0) }, launcher: "red", mode: "hot", stage: "search", fuel: 1e9, reserve: 1e9, searchS: TT.mineLifetimeS - 100 },
        });
        let killed = false;
        for (let i = 0; i < 1.3 / DT && !killed; i++) {
          step(world);
          killed = world.events.some((e) => e.type === "pdcKill");
        }
        if (killed) n++;
      }
      return n;
    };
    expect(killedWithin1s(1)).toBeLessThan(killedWithin1s(0) * 0.85);
  });
});
