import { afterEach, describe, expect, it } from "vitest";
import { torpedoTuning as TT } from "../src/data/weapons";
import type { Command, SimEvent } from "../src/sim/commands";
import { DT, step, submit } from "../src/sim/sim";
import { length, sub } from "../src/sim/vec3";
import type { Body, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

const saved = { ...TT };
afterEach(() => Object.assign(TT, saved));

/** Blue frigate "ff" at the origin; red frigate "tgt" where given. */
function duel(tgtPos = v3(5_000_000, 0, 0), tgtVel = v3(0, 0, 0), extra: Parameters<typeof makeShip>[0][] = []): World {
  return makeWorld([
    makeShip({ id: "ff" }),
    makeShip({ id: "tgt", faction: "red", position: tgtPos, velocity: tgtVel, heading: v3(1, 0, 0) }),
    ...extra.map((e) => makeShip(e)),
  ]);
}

const fire = (world: World, over: Partial<Extract<Command, { type: "launchTorpedoes" }>> = {}) =>
  submit(world, "blue", { type: "launchTorpedoes", ship: "ff", target: { kind: "track", id: "tgt" }, count: 1, mode: "hot", ...over });

/** Steps until `until` returns true or the time runs out; collects every event. */
function runUntil(world: World, limitS: number, until: (w: World, events: SimEvent[]) => boolean = () => false) {
  const all: (SimEvent & { t: number })[] = [];
  for (let i = 0; i < limitS / DT; i++) {
    step(world);
    for (const e of world.events) all.push({ ...e, t: world.tick * DT });
    if (until(world, world.events)) break;
  }
  return all;
}

describe("launching", () => {
  it("tubes fire in waves and reload; the magazine runs down and empties", () => {
    const world = duel();
    fire(world, { count: 6 });
    const events = runUntil(world, 30);
    const launches = events.filter((e) => e.type === "torpedoLaunched");
    expect(launches).toHaveLength(6);
    const times = launches.map((e) => e.t);
    // Two tubes: two at once, then two per reload.
    expect(times[1] - times[0]).toBeLessThan(0.1);
    expect(times[2] - times[0]).toBeCloseTo(TT.tubeReloadS, 0);
    expect(times[4] - times[0]).toBeCloseTo(2 * TT.tubeReloadS, 0);
    expect(world.ships[0].weapons.magazine).toBe(6);

    fire(world, { count: 10 }); // only 6 left
    runUntil(world, 1);
    expect(world.ships[0].weapons.magazine).toBe(0);
    fire(world, { count: 1 });
    const rejected = runUntil(world, 0.1).filter((e) => e.type === "commandRejected");
    expect(rejected).toHaveLength(1);
  });

  it("destroyed tubes cannot launch", () => {
    const world = duel();
    world.ships[0].health.tubes = 0;
    fire(world);
    const events = runUntil(world, 1);
    expect(events.some((e) => e.type === "commandRejected")).toBe(true);
    expect(world.torpedoes).toHaveLength(0);
  });

  it("launching does not change the ship's nav order", () => {
    const world = duel();
    submit(world, "blue", { type: "burnTo", ship: "ff", point: v3(0, 1_000_000, 0) });
    step(world);
    fire(world);
    step(world);
    expect(world.ships[0].order?.type).toBe("burnTo");
    expect(world.ships[0].nav.phase).not.toBe("coast");
  });
});

describe("guidance against ships", () => {
  it("hits a coasting ship 5,000 km away in about six minutes, within its delta-v budget", () => {
    const world = duel(v3(5_000_000, 0, 0), v3(-300, 400, 50));
    fire(world);
    let used = 0;
    const events = runUntil(world, 900, (w) => {
      for (const t of w.torpedoes) used += t.thrust * DT;
      return w.ships.find((s) => s.id === "tgt")!.health.hull < 1;
    });
    const hit = events.find((e) => e.type === "torpedoDetonated");
    expect(hit).toBeDefined();
    expect(hit!.t).toBeGreaterThan(4 * 60);
    expect(hit!.t).toBeLessThan(9 * 60);
    expect(used).toBeLessThanOrEqual(TT.deltaV + 1e-6);
  });

  it("hits a ship burning flat out sideways from 2,000 km, at every G setting", () => {
    // The hardest dodge: a constant burn across the line of fire for the whole flight.
    for (const g of ["cruise", "combat", "max"] as const) {
      const world = duel(v3(2_000_000, 0, 0));
      submit(world, "red", { type: "burnTo", ship: "tgt", point: v3(2_000_000, 20_000_000, 0), g });
      fire(world);
      const events = runUntil(world, 900, (_, ev) => ev.some((e) => e.type === "torpedoDetonated" || e.type === "torpedoExpired"));
      expect(events.some((e) => e.type === "torpedoDetonated" && e.hit === "tgt"), g).toBe(true);
    }
  });

  it("the fuse ignores friendly ships in the way", () => {
    // A friendly sits right on the line of fire, 1,000 km out.
    const world = duel(v3(3_000_000, 0, 0), v3(0, 0, 0), [{ id: "wing", position: v3(1_000_000, 0, 0) }]);
    fire(world);
    const events = runUntil(world, 900, (_, ev) => ev.some((e) => e.type === "torpedoDetonated"));
    const hits = events.filter((e) => e.type === "torpedoDetonated");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ hit: "tgt" });
    expect(world.ships.find((s) => s.id === "wing")!.health.hull).toBe(1);
  });

  it("damage comes from the side the torpedo arrives on", () => {
    // Target faces away (+x); the torpedo comes from -x, so it strikes the rear.
    const world = duel(v3(2_000_000, 0, 0));
    fire(world);
    const events = runUntil(world, 900, (_, ev) => ev.some((e) => e.type === "torpedoDetonated"));
    const dmg = events.find((e) => e.type === "damage" && e.ship === "tgt");
    expect(dmg).toMatchObject({ side: "rear" });
  });

  it("a torpedo that cannot catch its target is spent, not left drifting", () => {
    const world = duel(v3(1_000_000, 0, 0), v3(30_000, 0, 0)); // running away at 30 km/s
    fire(world);
    let used = 0;
    const events = runUntil(world, 3600, (w, ev) => {
      for (const t of w.torpedoes) used += t.thrust * DT;
      return ev.some((e) => e.type === "torpedoExpired");
    });
    expect(events.some((e) => e.type === "torpedoExpired" && e.reason === "spent")).toBe(true);
    expect(world.torpedoes).toHaveLength(0);
    expect(used).toBeLessThanOrEqual(TT.deltaV - TT.terminalReserve + 1e-6);
  });
});

describe("cold launch", () => {
  it("coasts dark until inside ignition range, then lights and hits", () => {
    // The launcher is running at the target at 5 km/s; the torpedo inherits that.
    const world = duel(v3(8_000_000, 0, 0));
    world.ships[0].velocity = v3(5_000, 0, 0);
    fire(world, { mode: "cold" });
    let litAt: number | null = null;
    const events = runUntil(world, 1800, (w, ev) => {
      const t = w.torpedoes[0];
      if (t && litAt === null && t.thrust > 0) litAt = length(sub(w.ships.find((s) => s.id === "tgt")!.position, t.position));
      return ev.some((e) => e.type === "torpedoDetonated");
    });
    expect(litAt).not.toBeNull();
    expect(litAt!).toBeLessThan(TT.coldIgnitionDistance);
    expect(litAt!).toBeGreaterThan(TT.coldIgnitionDistance * 0.95);
    expect(events.some((e) => e.type === "torpedoDetonated")).toBe(true);
  });
});

describe("point and object targets", () => {
  it("at an empty point: flies there, stops as a mine, and self-destructs on its timer", () => {
    TT.mineLifetimeS = 120;
    const world = duel(v3(50_000_000, 0, 0)); // the enemy is far outside seeker range
    const point = v3(1_500_000, 300_000, 0);
    fire(world, { target: { kind: "point", position: point } });
    let atMine: number | null = null;
    const events = runUntil(world, 3600, (w, ev) => {
      const t = w.torpedoes[0];
      if (t && t.guidance!.stage === "search" && t.guidance!.searchS > 100) atMine ??= length(sub(t.position, point));
      return ev.some((e) => e.type === "torpedoExpired");
    });
    expect(atMine).not.toBeNull();
    expect(atMine!).toBeLessThan(TT.pointArrival);
    expect(events.some((e) => e.type === "torpedoExpired" && e.reason === "timeout")).toBe(true);
  });

  it("at a point near an enemy: the seeker finds it and attacks", () => {
    const world = duel(v3(2_200_000, 900_000, 0), v3(0, -200, 0));
    fire(world, { target: { kind: "point", position: v3(2_000_000, 0, 0) } });
    const events = runUntil(world, 1800, (_, ev) => ev.some((e) => e.type === "torpedoDetonated"));
    expect(events.some((e) => e.type === "torpedoDetonated" && e.hit === "tgt")).toBe(true);
  });

  it("at an object: flies into it", () => {
    const world = duel(v3(50_000_000, 0, 0));
    const rock: Body = { id: "rock", name: "ROCK", kind: "asteroid", position: v3(800_000, 200_000, 0), radius: 5_000 };
    world.bodies.push(rock);
    fire(world, { target: { kind: "object", id: "rock" } });
    const events = runUntil(world, 900, (_, ev) => ev.some((e) => e.type === "destroyed"));
    expect(events.find((e) => e.type === "destroyed")).toMatchObject({ cause: "collision with ROCK" });
  });

  it("a torpedo whose target is destroyed retargets the nearest hostile", () => {
    // The second ship is near enough to the original line that the reserve can reach it.
    const world = duel(v3(3_000_000, 0, 0), v3(0, 0, 0), [{ id: "tgt2", faction: "red", position: v3(3_200_000, 150_000, 0) }]);
    fire(world);
    runUntil(world, 60);
    world.ships.find((s) => s.id === "tgt")!.destroyed = true; // stand-in for another weapon's kill
    world.ships = world.ships.filter((s) => !s.destroyed);
    const events = runUntil(world, 900, (_, ev) => ev.some((e) => e.type === "torpedoDetonated"));
    expect(events.find((e) => e.type === "torpedoDetonated")).toMatchObject({ hit: "tgt2" });
  });
});

describe("determinism", () => {
  it("the same salvo twice gives the same end state", () => {
    const run = () => {
      const world = duel(v3(3_000_000, 400_000, 0), v3(-200, 100, 0));
      submit(world, "red", { type: "burnTo", ship: "tgt", point: v3(0, 3_000_000, 0), g: "combat" });
      fire(world, { count: 6 });
      runUntil(world, 600);
      return JSON.stringify(world);
    };
    expect(run()).toBe(run());
  });
});
