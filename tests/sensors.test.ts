import { describe, expect, it } from "vitest";
import { sensorTuning as S } from "../src/data/sensors";
import { lineOfSight, markFired, seenBecause } from "../src/sim/sensors/detect";
import { buildSensorPicture } from "../src/sim/sensors/picture";
import { sweepSensors } from "../src/sim/sensors/tracks";
import { DT, step, submit } from "../src/sim/sim";
import { resolveTarget } from "../src/sim/target";
import type { Torpedo, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const KM = 1000;
const MOON = { id: "moon", name: "MOON", kind: "moon" as const, position: v3(5000 * KM, 0, 0), radius: 500 * KM };

/** Blue frigate at the origin, red frigate `km` out along x; sensors on. */
function duel(km: number, over: { blueSensors?: boolean; redThrust?: number } = {}): World {
  const blue = makeShip({ id: "blue-1", faction: "blue", sensorsOn: over.blueSensors ?? false });
  const red = makeShip({ id: "red-1", faction: "red", position: v3(km * KM, 0, 0), thrust: over.redThrust ?? 0 });
  const w = makeWorld([blue, red]);
  w.perfectInfo = false;
  sweepSensors(w);
  return w;
}
const ship = (w: World, id: string) => w.ships.find((s) => s.id === id)!;
const blueSees = (w: World, id = "red-1") => (w.sensors.blue[id]?.seenBy.length ?? 0) > 0;
const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(w);
};

describe("seeing rules", () => {
  it("bodies block line of sight", () => {
    expect(lineOfSight([MOON], v3(0, 0, 0), v3(10_000 * KM, 0, 0))).toBe(false);
    expect(lineOfSight([MOON], v3(0, 0, 0), v3(10_000 * KM, 2000 * KM, 0))).toBe(true);
  });

  it("a dark ship is seen only inside proximity range when your sensors are off", () => {
    expect(seenBecause([], ship(duel(900), "blue-1"), ship(duel(900), "red-1"))).toBe("proximity");
    const far = duel(1500);
    expect(seenBecause([], ship(far, "blue-1"), ship(far, "red-1"))).toBeNull();
    expect(blueSees(far)).toBe(false);
  });

  it("with sensors on, a dark ship is found within sensor range and no further", () => {
    expect(blueSees(duel(2500, { blueSensors: true }))).toBe(true);
    expect(blueSees(duel(3500, { blueSensors: true }))).toBe(false);
  });

  it("a loud ship is seen at any range: burning, sensors on, or just fired", () => {
    expect(blueSees(duel(50_000, { redThrust: 20 }))).toBe(true);
    const sensing = duel(50_000);
    ship(sensing, "red-1").sensorsOn = true;
    sweepSensors(sensing);
    expect(blueSees(sensing)).toBe(true);
    const fired = duel(50_000);
    markFired(ship(fired, "red-1"));
    sweepSensors(fired);
    expect(blueSees(fired)).toBe(true);
  });

  it("nothing is seen through a moon, however loud", () => {
    const w = duel(10_000, { redThrust: 20, blueSensors: true });
    w.bodies.push(MOON);
    ship(w, "red-1").position = v3(10_000 * KM, 0, 0);
    sweepSensors(w);
    expect(blueSees(w)).toBe(false);
  });

  it("firing and a stopped drive keep a ship loud for a while, then it is dark", () => {
    const w = duel(5000);
    markFired(ship(w, "red-1"));
    run(w, S.firedLoudS - 1);
    expect(blueSees(w)).toBe(true);
    run(w, 2 + S.lostAfterS + 0.5);
    expect(blueSees(w)).toBe(false);
    // A drive that just stopped: still bright for plumeFadeS.
    submit(w, "red", { type: "burnTo", ship: "red-1", point: v3(50_000 * KM, 0, 0) });
    run(w, 5);
    expect(ship(w, "red-1").thrust).toBeGreaterThan(0);
    submit(w, "red", { type: "coast", ship: "red-1" });
    run(w, S.plumeFadeS - 1);
    expect(blueSees(w)).toBe(true);
    run(w, 2);
    expect(blueSees(w)).toBe(false);
  });

  it("a cold torpedo is dark; sensors on find it within sensor range", () => {
    const w = duel(100_000);
    const torp: Torpedo = { id: "red-t1", faction: "red", position: v3(2000 * KM, 0, 0), velocity: v3(-5000, 0, 0), heading: v3(-1, 0, 0), thrust: 0 };
    w.torpedoes.push(torp);
    sweepSensors(w);
    expect(blueSees(w, "red-t1")).toBe(false);
    ship(w, "blue-1").sensorsOn = true;
    sweepSensors(w);
    expect(blueSees(w, "red-t1")).toBe(true);
  });

  it("records which ships see each contact (rule 11)", () => {
    const w = duel(5000);
    w.ships.push(makeShip({ id: "blue-2", faction: "blue", position: v3(4500 * KM, 0, 0) }));
    sweepSensors(w);
    expect(w.sensors.blue["red-1"].seenBy).toEqual(["blue-2"]);
  });

  it("the Sensors command switches a ship's sensors", () => {
    const w = duel(5000);
    submit(w, "blue", { type: "setSensors", ship: "blue-1", on: true });
    step(w);
    expect(ship(w, "blue-1").sensorsOn).toBe(true);
  });
});

describe("lost contacts", () => {
  it("leave a frozen marker with the last motion, and are aimed at along that line", () => {
    const w = duel(5000);
    const red = ship(w, "red-1");
    red.velocity = v3(0, 1000, 0);
    markFired(red);
    sweepSensors(w);
    expect(blueSees(w)).toBe(true);
    run(w, S.firedLoudS + S.lostAfterS + 1);
    const pic = buildSensorPicture(w, "blue");
    const t = pic.tracks.find((tr) => tr.id === "red-1")!;
    expect(t.lost).toBeDefined();
    const seen = w.sensors.blue["red-1"];
    expect(t.position).toEqual(seen.position);
    expect(t.velocity).toEqual(seen.velocity);
    expect(t.label).toBe(red.name);
    // Aim follows the course line; it coasts in a straight line, so the line is right.
    const aim = resolveTarget(w, { kind: "track", id: "red-1" }, "blue")!;
    expect(Math.abs(aim.position.y - red.position.y)).toBeLessThan(1);
    // The red side, which never saw blue, knows nothing of it.
    expect(resolveTarget(w, { kind: "track", id: "blue-1" }, "red")).toBeNull();
    expect(buildSensorPicture(w, "red").tracks.some((tr) => tr.id === "blue-1")).toBe(false);
  });

  it("fade out and are dropped", () => {
    const w = duel(5000);
    markFired(ship(w, "red-1"));
    sweepSensors(w);
    run(w, S.firedLoudS + S.lostAfterS + S.lostFadeS + 2);
    expect(w.sensors.blue["red-1"]).toBeUndefined();
    expect(buildSensorPicture(w, "blue").tracks.some((tr) => tr.id === "red-1")).toBe(false);
  });

  it("a contact destroyed in view is dropped at once", () => {
    const w = duel(500);
    expect(blueSees(w)).toBe(true);
    ship(w, "red-1").destroyed = true;
    step(w);
    expect(w.sensors.blue["red-1"]).toBeUndefined();
  });
});

describe("determinism", () => {
  it("the same world gives the same pictures", () => {
    const a = duel(5000, { redThrust: 20 });
    const b = duel(5000, { redThrust: 20 });
    run(a, 30);
    run(b, 30);
    expect(a.sensors).toEqual(b.sensors);
  });
});
