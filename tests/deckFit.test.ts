// The bottom deck fits the window: one row at full size when there is room, scaled a little
// when there is almost room, and the time panel lifted above the row when there is not.

import { describe, expect, it } from "vitest";
import { fitDeck } from "../src/ui/deck/fit";

const L = 602, M = 250, R = 614;

describe("deck fit", () => {
  it("full size in one row on a wide window, centered as a group", () => {
    const f = fitDeck(1920, L, M, R);
    expect(f.scale).toBe(1);
    expect(f.lifted).toBe(false);
    // Weapons, time, helm side by side, the group centered: equal space left and right.
    const groupRight = f.rightX + R;
    expect(f.leftX).toBeCloseTo(1920 - groupRight, 6);
    expect(f.rightX - (f.leftX + L)).toBeCloseTo(M + 2 * 12, 6);
    // The time panel has the same gap to each side, even though helm is wider than weapons.
    expect(f.midCenterX - M / 2 - (f.leftX + L)).toBeCloseTo(f.rightX - (f.midCenterX + M / 2), 6);
  });

  it("on a very wide window the deck sits between the rails, which run to the bottom", () => {
    expect(fitDeck(2560, L, M, R).railsClear).toBe(true);
    expect(fitDeck(1600, L, M, R).railsClear).toBe(false);
  });

  it("scales the row a little when it almost fits", () => {
    const f = fitDeck(1400, L, M, R);
    expect(f.lifted).toBe(false);
    expect(f.scale).toBeLessThan(1);
    expect(f.scale).toBeGreaterThanOrEqual(0.85);
    // The scaled row with its gaps fits between the margins.
    expect((L + M + R) * f.scale + 2 * 12).toBeLessThanOrEqual(1400 - 32 + 1e-9);
  });

  it("lifts the time panel on a narrow window, keeping weapons and helm larger", () => {
    const f = fitDeck(1114, L, M, R);
    expect(f.lifted).toBe(true);
    expect((L + R) * f.scale + 12).toBeLessThanOrEqual(1114 - 32 + 1e-9);
    expect(f.scale).toBeGreaterThan(0.85);
    // Weapons and helm next to each other, a gap between.
    expect(f.rightX - (f.leftX + L * f.scale)).toBeCloseTo(12, 6);
  });
});
