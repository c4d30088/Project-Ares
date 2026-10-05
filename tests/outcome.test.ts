// Win and loss: the pure check, and a retreating AI ship escaping the fight.

import { describe, expect, it } from "vitest";
import { evaluateOutcome } from "../src/sim/outcome";
import { loadScenario, type Scenario } from "../src/sim/scenario";
import { DT, step } from "../src/sim/sim";
import type { Torpedo } from "../src/sim/world";
import { makeShip, makeWorld } from "./helpers";

const ctx = { hostileAtStart: 1, escaped: 0 };
const blue = () => makeShip({ id: "b1", faction: "blue" });
const red = () => makeShip({ id: "r1", faction: "red" });
const redTorpedo = (stage: "flight" | "search"): Torpedo => ({
  id: "rt",
  faction: "red",
  position: { x: 1e6, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  heading: { x: 1, y: 0, z: 0 },
  thrust: 0,
  guidance: { target: { kind: "track", id: "b1" }, launcher: "r1", mode: "hot", stage, fuel: 1000, reserve: 100, searchS: 0 },
});

describe("outcome", () => {
  it("the fight goes on while both sides have ships", () => {
    expect(evaluateOutcome(makeWorld([blue(), red()]), "blue", ctx)).toBeNull();
  });

  it("loss: none of our ships left", () => {
    const o = evaluateOutcome(makeWorld([red()]), "blue", ctx);
    expect(o?.result).toBe("loss");
    expect(o?.title).toBe("DEFEAT");
  });

  it("win: no hostile ships left", () => {
    const o = evaluateOutcome(makeWorld([blue()]), "blue", ctx);
    expect(o?.result).toBe("win");
    expect(o?.detail).toBe("ALL TARGETS DESTROYED");
  });

  it("draw: both sides gone", () => {
    expect(evaluateOutcome(makeWorld([]), "blue", ctx)?.result).toBe("draw");
  });

  it("no win in a scenario that started with no hostile ships", () => {
    expect(evaluateOutcome(makeWorld([blue()]), "blue", { hostileAtStart: 0, escaped: 0 })).toBeNull();
    expect(evaluateOutcome(makeWorld([]), "blue", { hostileAtStart: 0, escaped: 0 })?.result).toBe("loss");
  });

  it("the win waits for enemy torpedoes still hunting, but not for a mine", () => {
    const w = makeWorld([blue()]);
    w.torpedoes = [redTorpedo("flight")];
    expect(evaluateOutcome(w, "blue", ctx)).toBeNull();
    w.torpedoes = [redTorpedo("search")];
    expect(evaluateOutcome(w, "blue", ctx)?.result).toBe("win");
  });

  it("says when the enemy broke off instead of being destroyed", () => {
    expect(evaluateOutcome(makeWorld([blue()]), "blue", { hostileAtStart: 2, escaped: 2 })?.detail).toBe("ENEMY BROKE OFF");
    expect(evaluateOutcome(makeWorld([blue()]), "blue", { hostileAtStart: 2, escaped: 1 })?.detail).toBe("ENEMY DESTROYED OR DRIVEN OFF");
  });
});

describe("escape", () => {
  const scenario: Scenario = {
    name: "escape",
    seed: 3,
    playerFaction: "blue",
    factions: [
      { id: "blue", name: "B", hostileTo: ["red"] },
      { id: "red", name: "R", hostileTo: ["blue"] },
    ],
    ships: [
      { id: "blue-1", name: "B1", faction: "blue", shipClass: "frigate", position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
      { id: "red-1", name: "R1", faction: "red", shipClass: "frigate", position: { x: 2e6, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
    ],
    ai: [{ ship: "red-1", behavior: "captain", personality: "duelist" }],
  };

  it("a badly damaged captain runs, gets clear, and leaves the fight: a win for us", () => {
    const w = loadScenario(scenario);
    w.ships.find((s) => s.id === "red-1")!.health.hull = 0.1;
    let escapedEvents = 0;
    let destroyed = 0;
    for (let i = 0; i < 2400 / DT; i++) {
      step(w);
      for (const e of w.events) {
        if (e.type === "escaped") escapedEvents++;
        if (e.type === "destroyed" && e.kind === "ship") destroyed++;
      }
    }
    expect(escapedEvents).toBe(1);
    expect(destroyed).toBe(0);
    expect(w.ships.map((s) => s.id)).toEqual(["blue-1"]);
    expect(evaluateOutcome(w, "blue", { hostileAtStart: 1, escaped: 1 })?.result).toBe("win");
  });

  it("an undamaged captain stays in the fight", () => {
    const w = loadScenario(scenario);
    for (let i = 0; i < 300 / DT; i++) step(w);
    expect(w.ships.some((s) => s.id === "red-1")).toBe(true);
  });
});
