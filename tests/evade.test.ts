import { describe, expect, it } from "vitest";
import { navTuning } from "../src/data/nav";
import { Predictor } from "../src/sim/predict";
import { DT, step, submit } from "../src/sim/sim";
import { angleBetween } from "../src/sim/physics";
import { length, normalize, sub } from "../src/sim/vec3";
import type { SimEvent } from "../src/sim/commands";
import type { World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const KM = 1000;
const run = (w: World, s: number, events: SimEvent[] = []) => {
  for (let i = 0; i < Math.round(s / DT); i++) {
    step(w);
    events.push(...w.events);
  }
  return events;
};
const ship = (w: World) => w.ships[0];

describe("Evade (one bend)", () => {
  it("bends the route for a while and still arrives where it was going", () => {
    const plain = makeWorld([makeShip({ id: "b", faction: "blue" })]);
    const bent = makeWorld([makeShip({ id: "b", faction: "blue" })]);
    for (const w of [plain, bent]) submit(w, "blue", { type: "burnTo", ship: "b", point: v3(2000 * KM, 0, 0) });
    run(plain, 20);
    run(bent, 20);
    submit(bent, "blue", { type: "evade", ship: "b" });
    run(plain, navTuning.evadeDurationS);
    run(bent, navTuning.evadeDurationS);
    // Off the straight line by now.
    expect(length(sub(ship(bent).position, ship(plain).position))).toBeGreaterThan(1 * KM);
    expect(ship(bent).order?.type).toBe("burnTo");
    const ev = run(bent, 3 * 3600);
    expect(ev.some((e) => e.type === "orderComplete")).toBe(true);
    expect(length(sub(ship(bent).position, v3(2000 * KM, 0, 0)))).toBeLessThan(1 * KM);
  });

  it("burns off-line by the evade angle while it lasts", () => {
    const w = makeWorld([makeShip({ id: "b", faction: "blue" })]);
    submit(w, "blue", { type: "burnTo", ship: "b", point: v3(2000 * KM, 0, 0) });
    run(w, 20);
    submit(w, "blue", { type: "evade", ship: "b" });
    run(w, 10);
    const off = (angleBetween(ship(w).heading, v3(1, 0, 0)) * 180) / Math.PI;
    expect(off).toBeGreaterThan(navTuning.evadeAngleDeg * 0.5);
    expect(off).toBeLessThan(navTuning.evadeAngleDeg * 2);
  });

  it("coasting, it nudges the ship sideways", () => {
    const w = makeWorld([makeShip({ id: "b", faction: "blue", velocity: v3(1000, 0, 0) })]);
    submit(w, "blue", { type: "evade", ship: "b" });
    run(w, navTuning.evadeDurationS + 1);
    const v = ship(w).velocity;
    expect(Math.hypot(v.y, v.z)).toBeGreaterThan(10);
    expect(Math.abs(v.x - 1000)).toBeLessThan(20);
    expect(ship(w).evade).toBeUndefined();
  });

  it("the route preview shows the bend", () => {
    const w = makeWorld([makeShip({ id: "b", faction: "blue" })]);
    submit(w, "blue", { type: "burnTo", ship: "b", point: v3(2000 * KM, 0, 0) });
    run(w, 20);
    submit(w, "blue", { type: "evade", ship: "b" });
    step(w);
    const p = new Predictor(w, "b", 120);
    while (!p.run(400));
    const lateral = Math.max(...p.result.points.map((pt) => Math.hypot(pt.position.y, pt.position.z)));
    expect(lateral).toBeGreaterThan(1 * KM);
  });

  it("goes the same way from the same seed", () => {
    const go = () => {
      const w = makeWorld([makeShip({ id: "b", faction: "blue", velocity: v3(1000, 0, 0) })]);
      submit(w, "blue", { type: "evade", ship: "b" });
      run(w, 20);
      return ship(w).velocity;
    };
    expect(go()).toEqual(go());
  });
});

describe("Evasive maneuvers (corkscrew)", () => {
  it("cancels the route and spirals: thrust at the cone angle, sweeping round", () => {
    const w = makeWorld([makeShip({ id: "b", faction: "blue", velocity: v3(500, 0, 0) })]);
    submit(w, "blue", { type: "burnTo", ship: "b", point: v3(5000 * KM, 0, 0) });
    run(w, 5);
    submit(w, "blue", { type: "evasive", ship: "b", g: "max" });
    run(w, 30);
    const o = ship(w).order;
    expect(o?.type).toBe("evasive");
    if (o?.type !== "evasive") return;
    const h1 = ship(w).heading;
    expect((angleBetween(h1, o.axis) * 180) / Math.PI).toBeCloseTo(navTuning.evasiveConeDeg, -1);
    run(w, navTuning.evasivePeriodS / 2);
    // Half a turn later the bow points the other way round the cone.
    expect((angleBetween(h1, ship(w).heading) * 180) / Math.PI).toBeGreaterThan(navTuning.evasiveConeDeg);
    expect(ship(w).thrust).toBeGreaterThan(0);
    expect(ship(w).g).toBe("max");
  });

  it("spoils railgun shots; against torpedoes from close in it is no shield", () => {
    // Red fires the railgun every 10 s from 150 km, or a 4-torpedo salvo from 1,000 km;
    // blue's PDCs hold, so only the dodge counts.
    const trial = (weapon: "rail" | "torp", evasive: boolean, seed: number) => {
      const ang = seed * 0.7;
      const range = weapon === "rail" ? 150 * KM : 1000 * KM;
      const red = makeShip({ id: "r", faction: "red", position: v3(Math.cos(ang) * range, Math.sin(ang) * range, 0) });
      const blue = makeShip({ id: "b", faction: "blue", heading: normalize(v3(-Math.sin(ang), Math.cos(ang), 0)) });
      const w = makeWorld([blue, red]);
      w.rngState = 1000 + seed;
      if (evasive) submit(w, "blue", { type: "evasive", ship: "b", g: "max" });
      if (weapon === "torp") submit(w, "red", { type: "launchTorpedoes", ship: "r", target: { kind: "track", id: "b" }, count: 4, mode: "hot" });
      let hits = 0;
      for (let i = 0; i < 300 / DT; i++) {
        if (weapon === "rail" && i % Math.round(10 / DT) === 5) submit(w, "red", { type: "fireRailgun", ship: "r", target: { kind: "track", id: "b" } });
        step(w);
        for (const e of w.events) if ((e.type === "slugHit" || e.type === "torpedoDetonated") && e.hit === "b") hits++;
        if (!w.ships.some((s) => s.id === "b")) break;
      }
      return hits;
    };
    const sum = (weapon: "rail" | "torp", ev: boolean) => [0, 1, 2, 3].reduce((a, s) => a + trial(weapon, ev, s), 0);
    expect(sum("rail", true)).toBeLessThan(sum("rail", false) / 4);
    expect(sum("torp", true)).toBeGreaterThan(0);
  });
});
