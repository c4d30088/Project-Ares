import { describe, expect, it } from "vitest";
import { sensorTuning as S } from "../src/data/sensors";
import { updateHeat } from "../src/sim/heat";
import type { SimEvent } from "../src/sim/commands";
import type { World } from "../src/sim/world";
import { makeShip, makeWorld } from "./helpers";

const frigate = () => makeWorld([makeShip({ id: "blue-1", faction: "blue" })]);
const tick = (w: World, seconds: number, events: SimEvent[] = []) => {
  for (let t = 0; t < seconds; t += 0.5) updateHeat(w, 0.5, events);
};

describe("heat from running dark", () => {
  it("builds while dark and fills in the class's dark time", () => {
    const w = frigate();
    tick(w, S.darkLimitS.frigate / 2);
    expect(w.ships[0].heat).toBeCloseTo(0.5, 2);
    tick(w, S.darkLimitS.frigate / 2 + 1);
    expect(w.ships[0].heat).toBe(1);
  });

  it("cools only while the ship is visible, faster than it heats", () => {
    const w = frigate();
    const s = w.ships[0];
    s.heat = 1;
    s.sensorsOn = true;
    tick(w, S.darkLimitS.frigate / S.coolFactor + 1);
    expect(s.heat).toBe(0);
    s.sensorsOn = false;
    s.loudS = 5; // drive just stopped, or just fired
    tick(w, 4);
    expect(s.heat).toBe(0);
  });

  it("damages crew and radiators at full heat, and damaged radiators heat faster", () => {
    const w = frigate();
    const s = w.ships[0];
    s.heat = 1;
    const events: SimEvent[] = [];
    tick(w, S.heatDamageIntervalS * 2 + 0.5, events);
    expect(events.filter((e) => e.type === "overheat")).toHaveLength(2);
    expect(s.health.crew).toBeCloseTo(1 - 2 * S.heatDamage);
    expect(s.health.radiators).toBeCloseTo(1 - 2 * S.heatDamage);

    const a = frigate(), b = frigate();
    b.ships[0].health.radiators = 0.5;
    tick(a, 100);
    tick(b, 100);
    expect(b.ships[0].heat).toBeCloseTo(2 * a.ships[0].heat, 3);
  });
});
