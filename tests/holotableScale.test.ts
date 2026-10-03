import { describe, expect, it } from "vitest";
import { gridLevels, gridStrength, niceStep, ringStrength } from "../src/render/scale";
import { formatDistance } from "../src/ui/format";

describe("grid levels", () => {
  it("picks a power-of-ten base spacing", () => {
    expect(gridLevels(1_000_000, 0.1)).toEqual({ base: 100_000, t: 0 });
    const l = gridLevels(5_000_000, 0.1);
    expect(l.base).toBe(100_000);
    expect(l.t).toBeCloseTo(Math.log10(5), 9);
  });

  // Zooming across a decade boundary must not make any grid line or ring jump in brightness.
  it("line strengths are continuous across a decade change", () => {
    const eps = 1e-9;
    const before = gridLevels(1e7 * (1 - eps), 0.1); // just below the boundary
    const after = gridLevels(1e7 * (1 + eps), 0.1);
    expect(after.base).toBe(before.base * 10);
    // A line with spacing before.base * 10^(i+1) is level i after the change.
    for (let i = 0; i < 2; i++) {
      expect(gridStrength(i, after.t)).toBeCloseTo(gridStrength(i + 1, before.t), 6);
      expect(ringStrength(i + 1, after.t)).toBeCloseTo(ringStrength(i + 2, before.t), 6);
    }
    // The finest level has faded out completely just before it disappears.
    expect(gridStrength(0, before.t)).toBeCloseTo(0, 6);
    expect(ringStrength(1, before.t)).toBeCloseTo(0, 6);
  });
});

describe("niceStep", () => {
  it("rounds up to the 1-2-5 sequence", () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.2)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(640_000)).toBe(1_000_000);
    expect(niceStep(0.03)).toBeCloseTo(0.05, 12);
  });
});

describe("formatDistance", () => {
  it("formats meters and kilometers", () => {
    expect(formatDistance(850)).toBe("850 M");
    expect(formatDistance(12_500)).toBe("12.5 KM");
    expect(formatDistance(10_000)).toBe("10 KM");
    expect(formatDistance(1_000_000)).toBe("1,000 KM");
    expect(formatDistance(1e9)).toBe("1,000,000 KM");
  });
});
