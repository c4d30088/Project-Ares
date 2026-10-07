// Hit flicker: the table stutters when our side is hit, harder for heavier hits; hits on the
// enemy never flicker our table.

import { describe, expect, it } from "vitest";
import { effectsTuning as FX } from "../src/data/effects";
import { hitFlickerFromEvents, type ImpactContext } from "../src/render/impactModel";
import type { SimEvent } from "../src/sim/commands";

const factions: Record<string, string> = { us: "blue", them: "red" };
const ctx: ImpactContext = { playerFaction: "blue", hostile: (a, b) => a !== b, factionOf: (id) => factions[id] };
const at = { x: 0, y: 0, z: 0 };
const hit = (ship: string, cause: string, hull: number): SimEvent => ({
  type: "damage", ship, faction: factions[ship], attacker: ship === "us" ? "red" : "blue", subsystem: "hull", side: "front", cause, position: at, hull, amount: 0,
});

describe("hit flicker", () => {
  it("nothing happening, no flicker", () => {
    expect(hitFlickerFromEvents([], ctx)).toBe(0);
  });

  it("hits on the enemy never flicker our table", () => {
    expect(hitFlickerFromEvents([hit("them", "torpedo", 0.5)], ctx)).toBe(0);
  });

  it("PDC rounds on our hull flicker lightly; a torpedo flickers harder, more for more hull", () => {
    const pdc = hitFlickerFromEvents([hit("us", "pdc", 0.01)], ctx);
    const small = hitFlickerFromEvents([hit("us", "torpedo", 0.05)], ctx);
    const big = hitFlickerFromEvents([hit("us", "torpedo", 0.3)], ctx);
    expect(pdc).toBeCloseTo(FX.hitFlickerPdc);
    expect(small).toBeGreaterThan(pdc);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(1);
  });

  it("losing our ship is the full flicker; several hits take the strongest", () => {
    expect(hitFlickerFromEvents([{ type: "destroyed", id: "us", cause: "torpedo", kind: "ship", position: at }], ctx)).toBe(1);
    expect(hitFlickerFromEvents([hit("us", "pdc", 0.01), hit("us", "railgun", 0.1)], ctx)).toBeCloseTo(Math.min(1, FX.hitFlickerMin + 0.1 * FX.hitFlickerPerHull));
  });
});
