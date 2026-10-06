import { afterEach, describe, expect, it } from "vitest";
import { sensorTuning as S } from "../src/data/sensors";
import { markFired } from "../src/sim/sensors/detect";
import { sweepSensors } from "../src/sim/sensors/tracks";
import { DT, step, submit } from "../src/sim/sim";
import { aimRailgun } from "../src/sim/weapons/railgun";
import { seekerView } from "../src/sim/weapons/torpedo";
import type { Torpedo, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const KM = 1000;
const saved = { ...S };
afterEach(() => Object.assign(S, saved));

function world(redKm: number): World {
  const w = makeWorld([makeShip({ id: "blue-1", faction: "blue" }), makeShip({ id: "red-1", faction: "red", position: v3(redKm * KM, 0, 0) })]);
  w.perfectInfo = false;
  sweepSensors(w);
  return w;
}
const ship = (w: World, id: string) => w.ships.find((s) => s.id === id)!;
const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(w);
};
const rejected = (w: World) => w.events.filter((e) => e.type === "commandRejected").map((e) => (e.type === "commandRejected" ? e.reason : ""));

describe("weapons and orders use what the side knows", () => {
  it("cannot target a ship the side has never seen", () => {
    const w = world(5000);
    submit(w, "blue", { type: "launchTorpedoes", ship: "blue-1", target: { kind: "track", id: "red-1" }, count: 2, mode: "hot" });
    step(w);
    expect(rejected(w)).toContain("unknown target");
    submit(w, "blue", { type: "intercept", ship: "blue-1", target: { kind: "track", id: "red-1" }, mode: "rendezvous" });
    step(w);
    expect(rejected(w)).toContain("unknown target");
  });

  it("aims the railgun along a lost contact's last course", () => {
    const w = world(300);
    const red = ship(w, "red-1");
    red.velocity = v3(0, 2000, 0);
    sweepSensors(w);
    // Seen inside proximity; then it slips out to 1,500 km and goes dark.
    red.position = v3(1500 * KM, 0, 0);
    run(w, S.lostAfterS + 1);
    const aim = aimRailgun(w, ship(w, "blue-1"), { kind: "track", id: "red-1" })!;
    const rec = w.sensors.blue["red-1"];
    // Aimed from the last-seen place along the last motion, not at the real ship.
    expect(rec.seenBy).toEqual([]);
    expect(Math.abs(aim.aimPoint.x - rec.position.x)).toBeLessThan(5 * KM);
    expect(Math.abs(aim.aimPoint.x - red.position.x)).toBeGreaterThan(1000 * KM);
  });

  it("firing the railgun lights up the shooter", () => {
    const w = world(5000);
    const red = ship(w, "red-1");
    markFired(red);
    sweepSensors(w);
    expect(w.sensors.blue["red-1"].seenBy).toEqual(["blue-1"]);
    run(w, S.firedLoudS + S.lostAfterS + 1);
    expect(w.sensors.blue["red-1"].seenBy).toEqual([]);
    // Red fires at blue (seen inside proximity? no: blue is dark at 5,000 km, red cannot).
    submit(w, "red", { type: "fireRailgun", ship: "red-1", target: { kind: "track", id: "blue-1" } });
    step(w);
    expect(rejected(w)).toContain("unknown target");
  });

  it("PDC Auto does not engage a torpedo the side cannot see", () => {
    S.proximityRange = 5 * KM; // so a torpedo inside PDC range can be dark
    const w = world(5000);
    const blue = ship(w, "blue-1");
    for (const m of blue.weapons.pdcs) m.mode = "auto";
    const torp: Torpedo = { id: "red-t1", faction: "red", position: v3(10 * KM, 0, 0), velocity: v3(-1, 0, 0), heading: v3(-1, 0, 0), thrust: 0 };
    w.torpedoes.push(torp);
    sweepSensors(w);
    step(w);
    expect(blue.weapons.pdcs.some((m) => m.engaged)).toBe(false);
    blue.sensorsOn = true;
    sweepSensors(w);
    step(w);
    expect(blue.weapons.pdcs.some((m) => m.engaged === "red-t1")).toBe(true);
  });
});

describe("torpedo seeker", () => {
  it("flies on its last sighting behind a moon and picks the target up again", () => {
    const w = world(3000);
    const red = ship(w, "red-1");
    markFired(red); // seen: loud
    sweepSensors(w);
    submit(w, "blue", { type: "launchTorpedoes", ship: "blue-1", target: { kind: "track", id: "red-1" }, count: 1, mode: "hot" });
    run(w, 1);
    const t = w.torpedoes[0];
    expect(t?.guidance?.seen).toBeDefined();
    // A moon between them and red dark again: the seeker loses it.
    w.bodies.push({ id: "moon", name: "MOON", kind: "moon", position: v3(1500 * KM, 0, 0), radius: 200 * KM, gm: 0 });
    red.loudS = 0;
    const view = seekerView(w, t, true)!;
    expect(t.guidance!.blind).toBe(true);
    expect(view.position.x).toBeCloseTo(t.guidance!.seen!.position.x, -3);
    // Moon gone: in view again.
    w.bodies = [];
    markFired(red);
    seekerView(w, t, true);
    expect(t.guidance!.blind).toBe(false);
  });
});
