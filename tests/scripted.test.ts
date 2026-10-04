// The scripted enemy: acts only through commands, closes to range and holds, fires
// coordinated salvos on a timer, closes in with the railgun when out of torpedoes.

import { describe, expect, it } from "vitest";
import { scenarios } from "../src/data/scenarios";
import { loadScenario, type Scenario } from "../src/sim/scenario";
import { DT, step } from "../src/sim/sim";
import { length, sub } from "../src/sim/vec3";
import { predictImpact } from "../src/sim/weapons/torpedo";
import type { World } from "../src/sim/world";

const firstFight = () => loadScenario(scenarios["first-fight"] as Scenario);
const dist = (w: World, a: string, b: string) => length(sub(w.ships.find((s) => s.id === a)!.position, w.ships.find((s) => s.id === b)!.position));

describe("scripted enemy", () => {
  it("acts only through commands from its own side", () => {
    const w = firstFight();
    const seen: string[] = [];
    for (let i = 0; i < 5 / DT; i++) {
      for (const q of w.pending) seen.push(`${q.faction}:${q.command.type}:${q.command.ship}`);
      step(w);
    }
    expect(seen.some((x) => x.startsWith("red:burnTo:red-ff1"))).toBe(true);
    expect(seen.every((x) => x.startsWith("red:"))).toBe(true);
  });

  it("closes to its engagement range at Cruise G and holds there", () => {
    const w = firstFight();
    const range = w.ai[0].engageRange;
    let strainAtArrival = -1;
    for (let i = 0; i < 1100 / DT; i++) {
      step(w);
      if (strainAtArrival < 0 && dist(w, "red-ff1", "blue-ff1") < range * 1.1) strainAtArrival = w.ships.find((s) => s.id === "red-ff1")!.strain;
    }
    expect(strainAtArrival).toBe(0);
    for (const id of ["red-ff1", "red-ff2"]) {
      const d = dist(w, id, "blue-ff1");
      expect(d).toBeGreaterThan(range * 0.85);
      expect(d).toBeLessThan(range * 1.15);
    }
  });

  it("the pair's salvos are timed to arrive together", () => {
    const w = firstFight();
    for (const s of w.ships.filter((x) => x.id === "blue-ff1")) for (const m of s.weapons.pdcs) m.mode = "hold";
    const impacts = new Map<string, number>();
    for (let i = 0; i < 1100 / DT && impacts.size < 8; i++) {
      step(w);
      for (const t of w.torpedoes) {
        if (impacts.has(t.id) || t.faction !== "red" || t.guidance?.stage !== "flight" || t.thrust === 0) continue;
        const p = predictImpact(w, t);
        if (p) impacts.set(t.id, w.tick * DT + p.t);
      }
    }
    // First wave from each ship (tube 1 and 2 of each): within a few seconds of each other.
    const firstOf = (ship: string) => Math.min(...[...impacts].filter(([id]) => id.startsWith(ship)).map(([, t]) => t));
    expect(Math.abs(firstOf("red-ff1") - firstOf("red-ff2"))).toBeLessThan(10);
  });

  it("out of torpedoes, closes in and uses its railgun", () => {
    const w = firstFight();
    for (const s of w.ships.filter((x) => x.faction === "red")) s.weapons.magazine = 0;
    let fired = false;
    for (let i = 0; i < 1800 / DT && !fired; i++) {
      step(w);
      fired = w.events.some((e) => e.type === "railgunFired" && e.faction === "red");
    }
    expect(fired).toBe(true);
    expect(Math.min(dist(w, "red-ff1", "blue-ff1"), dist(w, "red-ff2", "blue-ff1"))).toBeLessThan(w.ai[0].railgunRange);
  });

  it("the same fight twice ends the same", () => {
    const run = () => {
      const w = firstFight();
      for (let i = 0; i < 900 / DT; i++) step(w);
      return JSON.stringify(w);
    };
    expect(run()).toBe(run());
  });
});
