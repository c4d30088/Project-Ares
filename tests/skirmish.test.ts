// Skirmish setup: the page address round-trips, and every map builds into a scenario that
// loads and runs with the AI captains it asks for.

import { describe, expect, it } from "vitest";
import { personalityPresets } from "../src/data/ai";
import { buildSkirmish, parseSkirmish, skirmishMaps, skirmishQuery, type SkirmishSetup } from "../src/data/skirmish";
import { loadScenario } from "../src/sim/scenario";
import { DT, step } from "../src/sim/sim";
import type { CaptainScript } from "../src/sim/world";

describe("skirmish setup address", () => {
  it("round-trips", () => {
    const setup: SkirmishSetup = { map: skirmishMaps[0].id, enemies: 2, personality: "skulker" };
    expect(parseSkirmish(new URLSearchParams(skirmishQuery(setup)))).toEqual(setup);
  });

  it("ignores an unknown map and falls back on bad options", () => {
    expect(parseSkirmish(new URLSearchParams("?skirmish=nowhere"))).toBeNull();
    expect(parseSkirmish(new URLSearchParams(""))).toBeNull();
    const s = parseSkirmish(new URLSearchParams(`?skirmish=${skirmishMaps[0].id}&enemies=9&ai=nope`));
    expect(s).toEqual({ map: skirmishMaps[0].id, enemies: 1, personality: "duelist" });
  });
});

describe.each(skirmishMaps)("skirmish map $id", (map) => {
  for (const enemies of [1, 2] as const) {
    for (const personality of Object.keys(personalityPresets) as (keyof typeof personalityPresets)[]) {
      it(`builds and runs: 1 v ${enemies}, ${personality}`, () => {
        const scenario = buildSkirmish({ map: map.id, enemies, personality });
        const w = loadScenario(scenario);
        expect(w.ships.filter((s) => s.faction === "red")).toHaveLength(enemies);
        expect(w.ships.filter((s) => s.faction === "blue")).toHaveLength(1);
        const captains = w.ai.filter((a): a is CaptainScript => a.behavior === "captain");
        expect(captains).toHaveLength(enemies);
        expect(captains.every((c) => c.personality.aggression === personalityPresets[personality].aggression)).toBe(true);
        for (let i = 0; i < 30 / DT; i++) step(w);
        expect(w.ships.length).toBeGreaterThan(0);
      });
    }
  }

  it("starts everyone clear of the bodies and not on top of each other", () => {
    const w = loadScenario(buildSkirmish({ map: map.id, enemies: 2, personality: "duelist" }));
    for (const s of w.ships) {
      for (const b of w.bodies) {
        const d = Math.hypot(s.position.x - b.position.x, s.position.y - b.position.y, s.position.z - b.position.z);
        expect(d, `${s.id} near ${b.id}`).toBeGreaterThan(b.radius * 1.5);
      }
    }
    const [a, ...rest] = w.ships;
    for (const s of rest) expect(Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y, a.position.z - s.position.z)).toBeGreaterThan(40_000);
  });
});
