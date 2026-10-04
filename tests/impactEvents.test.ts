// Hit events carry where they happened and how much damage was done, so the table can
// draw explosions, sparks and hit text and the alert log can say what was lost.

import { describe, expect, it } from "vitest";
import { combatTuning as C } from "../src/data/combat";
import { torpedoTuning as TT } from "../src/data/weapons";
import type { SimEvent } from "../src/sim/commands";
import { DT, step, submit } from "../src/sim/sim";
import { length, sub } from "../src/sim/vec3";
import type { Torpedo, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

function runUntil(world: World, seconds: number, stop: (ev: SimEvent[]) => boolean): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < seconds / DT; i++) {
    step(world);
    all.push(...world.events);
    if (stop(world.events)) break;
  }
  return all;
}

/** A red torpedo coasting straight at a blue frigate parked at the origin. */
function torpedoAtShip(speed = 5000, dist = 20_000): { world: World; torpedo: Torpedo } {
  const world = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "red", faction: "red", position: v3(1e9, 0, 0) })]);
  const torpedo: Torpedo = {
    id: "t1", faction: "red", position: v3(dist, 0, 0), velocity: v3(-speed, 0, 0), heading: v3(-1, 0, 0), thrust: 0,
    guidance: { target: { kind: "track", id: "ff" }, launcher: "red", mode: "hot", stage: "flight", fuel: TT.terminalReserve, reserve: TT.terminalReserve, searchS: 0 },
  };
  world.torpedoes.push(torpedo);
  return { world, torpedo };
}

describe("torpedo hit events", () => {
  it("say where the warhead went off, near the struck ship", () => {
    const { world } = torpedoAtShip();
    const events = runUntil(world, 30, (ev) => ev.some((e) => e.type === "torpedoDetonated"));
    const boom = events.find((e) => e.type === "torpedoDetonated");
    expect(boom).toBeDefined();
    if (boom?.type !== "torpedoDetonated") return;
    expect(boom.hit).toBe("ff");
    // Within the fuse radius, plus the distance flown during one tick.
    expect(length(sub(boom.position, v3(0, 0, 0)))).toBeLessThanOrEqual(TT.fuseRadius + 5000 * DT);
  });

  it("report the damage actually done, who did it and who took it", () => {
    const { world } = torpedoAtShip();
    const ff = world.ships[0];
    const events = runUntil(world, 30, (ev) => ev.some((e) => e.type === "damage"));
    const dmg = events.find((e) => e.type === "damage");
    expect(dmg).toBeDefined();
    if (dmg?.type !== "damage") return;
    expect(dmg).toMatchObject({ ship: "ff", faction: "blue", attacker: "red", cause: "torpedo" });
    expect(dmg.hull).toBeCloseTo(C.torpedoHull, 9);
    expect(dmg.hull).toBeCloseTo(1 - ff.health.hull, 9);
    expect(dmg.position).toEqual(ff.position);
    if (dmg.subsystem !== "hull") {
      expect(dmg.amount).toBeCloseTo(C.torpedoSubsystem, 9);
      expect(dmg.amount).toBeCloseTo(1 - ff.health[dmg.subsystem], 9);
    }
  });

  it("report only what was left to lose on a nearly dead subsystem or hull", () => {
    const { world } = torpedoAtShip();
    const ff = world.ships[0];
    ff.health.hull = 0.1;
    const events = runUntil(world, 30, (ev) => ev.some((e) => e.type === "damage"));
    const dmg = events.find((e) => e.type === "damage");
    if (dmg?.type !== "damage") throw new Error("no damage event");
    expect(dmg.hull).toBeCloseTo(0.1, 9); // not the full 0.35
    const destroyed = events.find((e) => e.type === "destroyed" && e.id === "ff");
    expect(destroyed).toMatchObject({ kind: "ship", cause: "torpedo" });
  });
});

describe("destroyed events", () => {
  it("say what kind of thing was lost and where", () => {
    const { world } = torpedoAtShip();
    const events = runUntil(world, 30, (ev) => ev.some((e) => e.type === "destroyed"));
    const gone = events.find((e) => e.type === "destroyed");
    expect(gone).toMatchObject({ id: "t1", kind: "torpedo", cause: "detonated" });
    if (gone?.type !== "destroyed") return;
    expect(length(sub(gone.position, v3(0, 0, 0)))).toBeLessThanOrEqual(TT.fuseRadius + 5000 * DT);
  });
});

describe("slug hit events", () => {
  it("say where the slug struck and carry the railgun's damage", () => {
    const world = makeWorld([makeShip({ id: "ff", heading: v3(1, 0, 0) }), makeShip({ id: "tgt", faction: "red", position: v3(500_000, 0, 0) })]);
    submit(world, "blue", { type: "fireRailgun", ship: "ff", target: { kind: "track", id: "tgt" } });
    const events = runUntil(world, 120, (ev) => ev.some((e) => e.type === "slugHit"));
    const hit = events.find((e) => e.type === "slugHit");
    const dmg = events.find((e) => e.type === "damage");
    if (hit?.type !== "slugHit" || dmg?.type !== "damage") throw new Error("no hit");
    expect(length(sub(hit.position, world.ships[1].position))).toBeLessThanOrEqual(C.hitRadius.frigate + 20_000 * DT);
    expect(dmg).toMatchObject({ ship: "tgt", faction: "red", attacker: "blue", cause: "railgun" });
    expect(dmg.hull).toBeCloseTo(C.slugHull, 9);
  });
});

describe("PDC kill events", () => {
  it("say where the torpedo died and whose guns killed it", () => {
    const { world } = torpedoAtShip(3000, 60_000);
    for (const m of world.ships[0].weapons.pdcs) m.mode = "auto";
    const events = runUntil(world, 30, (ev) => ev.some((e) => e.type === "pdcKill" || e.type === "torpedoDetonated"));
    const kill = events.find((e) => e.type === "pdcKill");
    if (kill?.type !== "pdcKill") throw new Error("the torpedo got through");
    expect(kill).toMatchObject({ ship: "ff", faction: "blue", torpedo: "t1", target: "torpedo" });
    // Killed inside the PDCs' reach, along the torpedo's line of approach.
    expect(length(kill.position)).toBeGreaterThan(0);
    expect(length(kill.position)).toBeLessThan(60_000);
    expect(kill.position.y).toBeCloseTo(0, 6);
  });
});
