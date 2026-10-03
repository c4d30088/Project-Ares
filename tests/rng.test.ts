import { describe, expect, it } from "vitest";
import { Rng } from "../src/sim/rng";

describe("Rng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it("gives different sequences for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 100 }, () => a.next() === b.next()).filter(Boolean);
    expect(same.length).toBeLessThan(5);
  });

  it("stays in [0, 1) and covers the range evenly", () => {
    const rng = new Rng(42);
    const buckets = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      buckets[Math.floor(x * 10)]++;
    }
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
  });

  it("int() is inclusive at both ends", () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("resumes identically from a saved state", () => {
    const a = new Rng(99);
    for (let i = 0; i < 50; i++) a.next();
    const b = new Rng(0);
    b.setState(a.getState());
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });
});
