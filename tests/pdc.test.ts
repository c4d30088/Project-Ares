// Point defense: arcs, modes, switching, ammo, and saturation statistics over many seeded
// runs (ARCHITECTURE.md testing list).

import { describe, expect, it } from "vitest";
import { torpedoTuning as TT } from "../src/data/weapons";
import { DT, step, submit } from "../src/sim/sim";
import { pdcMountDirections } from "../src/sim/shipFrame";
import { add, normalize, scale, sub, type Vec3 } from "../src/sim/vec3";
import type { Torpedo, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

/** A blue frigate with all PDCs on Auto, and a red ship far away to own the torpedoes. */
function defended(seed: number): World {
  const world = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "red", faction: "red", position: v3(1e9, 0, 0) })]);
  for (const m of world.ships[0].weapons.pdcs) m.mode = "auto";
  world.rngState = seed;
  return world;
}

/** n hostile torpedoes inbound at `speed`, spread over a cone, arriving within `windowS` seconds. */
function salvo(world: World, n: number, speed = 8000, windowS = 3, from: Vec3 = v3(1, 0.3, 0.2), spread = 0.25): void {
  const axis = normalize(from);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const off = v3(0, Math.cos(a), Math.sin(a));
    const dir = normalize(add(axis, scale(sub(off, scale(axis, axis.x * off.x + axis.y * off.y + axis.z * off.z)), spread)));
    const dist = 200_000 + (windowS * speed * i) / Math.max(1, n - 1);
    const t: Torpedo = {
      id: `t${i}`, faction: "red", position: scale(dir, dist), velocity: scale(dir, -speed), heading: scale(dir, -1), thrust: 0,
      guidance: { target: { kind: "track", id: "ff" }, launcher: "red", mode: "hot", stage: "flight", fuel: TT.terminalReserve, reserve: TT.terminalReserve, searchS: 0 },
    };
    world.torpedoes.push(t);
  }
}

/** Runs until every torpedo is gone; returns how many reached the ship. */
function leaks(world: World): number {
  let hits = 0;
  for (let i = 0; i < 120 / DT && world.torpedoes.length; i++) {
    step(world);
    hits += world.events.filter((e) => e.type === "torpedoDetonated").length;
    world.ships[0].health.hull = 1; // keep the ship alive so every torpedo counts
    world.ships[0].destroyed = false;
  }
  return hits;
}

const meanLeak = (n: number, runs = 200) => {
  let total = 0;
  for (let s = 1; s <= runs; s++) {
    const w = defended(s * 7919);
    salvo(w, n);
    total += leaks(w);
  }
  return total / runs;
};

describe("PDC saturation", () => {
  // 4 PDCs against salvos arriving inside 3 s (DESIGN.md: 12 in 3 s will miss some).
  const l1 = meanLeak(1), l4 = meanLeak(4), l8 = meanLeak(8), l12 = meanLeak(12), l16 = meanLeak(16);

  it("a lone torpedo or a small salvo is stopped", () => {
    expect(l1).toBe(0);
    expect(l4).toBeLessThan(0.05);
  });

  it("12 torpedoes in 3 seconds get some through; bigger salvos get more through", () => {
    expect(l12).toBeGreaterThan(0.3);
    expect(l12).toBeLessThan(4);
    expect(l8).toBeLessThan(l12);
    expect(l12).toBeLessThan(l16);
  });
});

describe("PDC mounts and modes", () => {
  it("every direction around the hull is inside at least one mount's arc", async () => {
    const { loadouts } = await import("../src/data/combat");
    const mounts = pdcMountDirections(4);
    const arc = (loadouts.frigate.pdcArcDeg * Math.PI) / 180;
    for (let i = 0; i < 400; i++) {
      // Fibonacci sphere directions in the body frame.
      const z = 1 - (2 * (i + 0.5)) / 400, r = Math.sqrt(1 - z * z), a = i * 2.39996;
      const d = { f: z, l: r * Math.cos(a), u: r * Math.sin(a) };
      expect(mounts.some((m) => Math.acos(Math.max(-1, Math.min(1, m.f * d.f + m.l * d.l + m.u * d.u))) <= arc)).toBe(true);
    }
  });

  it("a mount takes the switch time to swing onto a new target before it fires", async () => {
    const { pdcTuning } = await import("../src/data/weapons");
    const world = defended(1);
    salvo(world, 1, 100, 0, v3(1, 0, 0));
    world.torpedoes[0].position = v3(10_000, 0, 0); // already inside effective range
    let firstFire: number | null = null;
    for (let i = 0; i < 40 && firstFire === null; i++) {
      step(world);
      if (world.ships[0].weapons.pdcs.some((m) => m.firing)) firstFire = i * DT;
    }
    expect(firstFire).not.toBeNull();
    expect(firstFire!).toBeGreaterThanOrEqual(pdcTuning.switchS - 1e-9);
    expect(firstFire!).toBeLessThan(pdcTuning.switchS + 2 * DT);
  });

  it("Hold never fires; ammunition runs out", () => {
    const held = defended(1);
    for (const m of held.ships[0].weapons.pdcs) m.mode = "hold";
    salvo(held, 4);
    expect(leaks(held)).toBe(4);

    const dry = defended(1);
    for (const m of dry.ships[0].weapons.pdcs) m.ammoS = 0.5;
    salvo(dry, 8);
    const out: number[] = [];
    for (let i = 0; i < 120 / DT && dry.torpedoes.length; i++) {
      step(dry);
      for (const e of dry.events) if (e.type === "pdcAmmoOut") out.push(e.mount);
      dry.ships[0].health.hull = 1;
    }
    expect(out.length).toBeGreaterThan(0);
    expect(dry.ships[0].weapons.pdcs.every((m) => m.ammoS === 0 || !m.firing)).toBe(true);
  });

  it("Manual on a ship inside range damages it; out of range it does nothing", () => {
    const world = defended(3);
    world.ships.push(makeShip({ id: "vic", faction: "red", position: v3(8_000, 0, 0) }));
    submit(world, "blue", { type: "setPdcs", ship: "ff", mount: "all", mode: "manual", target: { kind: "track", id: "vic" } });
    for (let i = 0; i < 30 / DT; i++) step(world);
    expect(world.ships.find((s) => s.id === "vic")?.health.hull ?? 0).toBeLessThan(1);

    const far = defended(3);
    far.ships.push(makeShip({ id: "vic", faction: "red", position: v3(80_000, 0, 0) }));
    submit(far, "blue", { type: "setPdcs", ship: "ff", mount: "all", mode: "manual", target: { kind: "track", id: "vic" } });
    for (let i = 0; i < 30 / DT; i++) step(far);
    expect(far.ships.find((s) => s.id === "vic")!.health.hull).toBe(1);
  });

  it("a barrage at a point kills torpedoes flying through it", () => {
    const world = defended(5);
    salvo(world, 6, 8000, 3, v3(1, 0, 0), 0);
    // Every torpedo passes through x = 12 km on the axis; barrage there, Manual.
    submit(world, "blue", { type: "setPdcs", ship: "ff", mount: "all", mode: "manual", target: { kind: "point", position: v3(12_000, 0, 0) } });
    const kills: string[] = [];
    for (let i = 0; i < 120 / DT && world.torpedoes.length; i++) {
      step(world);
      for (const e of world.events) if (e.type === "pdcKill") kills.push(e.torpedo);
      world.ships[0].health.hull = 1;
    }
    expect(kills.length).toBeGreaterThan(0);
  });

  it("the same seed gives the same kills", () => {
    const run = () => {
      const w = defended(42);
      salvo(w, 12);
      leaks(w);
      return w.rngState;
    };
    expect(run()).toBe(run());
  });
});
