import { describe, expect, it } from "vitest";
import { projectileFlightTime, leadShot } from "../src/sim/intercept";
import { Rng } from "../src/sim/rng";
import { add, length, scale, sub, type Vec3 } from "../src/sim/vec3";
import { v3 } from "./helpers";

const rv = (rng: Rng, mag: number): Vec3 => v3(rng.range(-mag, mag), rng.range(-mag, mag), rng.range(-mag, mag));

describe("leadShot: a projectile carries the shooter's velocity plus its muzzle velocity", () => {
  it("leaves at exactly the muzzle speed relative to the shooter", () => {
    const rng = new Rng(77);
    for (let i = 0; i < 300; i++) {
      const fromV = rv(rng, 15_000);
      const shot = leadShot(v3(0, 0, 0), fromV, rv(rng, 1e6), rv(rng, 3000), 6000);
      if (!shot) continue;
      expect(length(sub(shot.velocity, fromV))).toBeCloseTo(6000, 6);
    }
  });

  it("arrives where the target is when it gets there, at any shooter or target speed", () => {
    const rng = new Rng(2024);
    let tested = 0;
    for (let i = 0; i < 500; i++) {
      const from = rv(rng, 1e5), to = rv(rng, 5e5);
      // Speeds low enough that most cases can be caught, but well past the muzzle speed of a PDC round.
      const fromV = rv(rng, 8000), toV = rv(rng, 8000);
      const speed = rng.range(6000, 25_000);
      const shot = leadShot(from, fromV, to, toV, speed);
      if (!shot) continue;
      tested++;
      const roundAtT = add(from, scale(shot.velocity, shot.t));
      const targetAtT = add(to, scale(toV, shot.t));
      expect(length(sub(roundAtT, targetAtT)), `case ${i}`).toBeLessThan(1e-6 * (1 + length(sub(targetAtT, from))));
    }
    expect(tested).toBeGreaterThan(250);
  });

  it("a fast shooter is not thrown off line by its own speed", () => {
    // 1,000 km ahead, target at rest; the shooter drifts sideways at 10 km/s.
    const shot = leadShot(v3(0, 0, 0), v3(0, 10_000, 0), v3(1_000_000, 0, 0), v3(0, 0, 0), 20_000)!;
    // The muzzle velocity points back against the drift, so the slug's sideways motion cancels.
    expect(shot.velocity.y).toBeCloseTo(0, 6);
    expect(shot.velocity.x).toBeGreaterThan(0);
    expect(shot.t).toBeCloseTo(1_000_000 / Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z), 6);
  });

  it("gives up on a target that is getting away faster than the projectile flies", () => {
    expect(leadShot(v3(0, 0, 0), v3(0, 0, 0), v3(1000, 0, 0), v3(9000, 0, 0), 6000)).toBeNull();
    expect(leadShot(v3(0, 0, 0), v3(0, 30_000, 0), v3(1000, 0, 0), v3(0, 0, 0), 20_000)).toBeNull();
    // ...but one running toward the gun is met sooner than its range alone suggests.
    const t = projectileFlightTime(v3(10_000, 0, 0), v3(-4000, 0, 0), 6000)!;
    expect(t).toBeCloseTo(1, 9);
  });
});
