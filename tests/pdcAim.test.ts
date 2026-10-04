// The picture says what each firing PDC is aimed at and how that target moves, so the
// tracer rounds can lead it (the enemy's included).

import { describe, expect, it } from "vitest";
import { torpedoTuning as TT } from "../src/data/weapons";
import { buildPerfectPicture } from "../src/sim/sensors/picture";
import { step } from "../src/sim/sim";
import type { Torpedo, World } from "../src/sim/world";
import { makeShip, makeWorld, v3 } from "./helpers";

function torpedo(faction: string, target: string, position = v3(0, 0, 0), velocity = v3(0, 0, 0)): Torpedo {
  return {
    id: `${faction}-t`, faction, position, velocity, heading: v3(1, 0, 0), thrust: 0,
    guidance: { target: { kind: "track", id: target }, launcher: faction, mode: "hot", stage: "flight", fuel: TT.terminalReserve, reserve: TT.terminalReserve, searchS: 0 },
  };
}

/** Steps until some mount is firing (or gives up). */
function untilFiring(world: World): void {
  for (let i = 0; i < 40; i++) {
    step(world);
    if (world.ships.some((s) => s.weapons.pdcs.some((m) => m.firing))) return;
  }
  throw new Error("no PDC ever fired");
}

describe("PDC aim in the sensor picture", () => {
  it("our firing mount reports where its target is and how fast it moves", () => {
    const world = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "red", faction: "red", position: v3(1e9, 0, 0) })]);
    for (const m of world.ships[0].weapons.pdcs) m.mode = "auto";
    world.torpedoes.push(torpedo("red", "ff", v3(40_000, 0, 0), v3(-1500, 300, 0)));
    untilFiring(world);
    const mount = buildPerfectPicture(world, "blue").ownShips[0].pdcs.find((m) => m.firing)!;
    expect(mount.aimId).toBe("red-t");
    expect(mount.aimAt!.velocity).toEqual(world.torpedoes[0].velocity);
    expect(mount.aimAt!.position).toEqual(world.torpedoes[0].position);
  });

  it("the enemy's firing PDCs show what they shoot at and how it moves, not a target standing still", () => {
    // Red frigate shooting at our torpedo, which is moving fast.
    const world = makeWorld([makeShip({ id: "gun", faction: "red" }), makeShip({ id: "ff", position: v3(1e9, 0, 0) })]);
    for (const m of world.ships[0].weapons.pdcs) m.mode = "auto";
    world.torpedoes.push(torpedo("blue", "gun", v3(40_000, 0, 0), v3(-2500, 0, 700)));
    untilFiring(world);
    const track = buildPerfectPicture(world, "blue").tracks.find((t) => t.id === "gun")!;
    expect(track.pdcFire!.length).toBeGreaterThan(0);
    for (const aim of track.pdcFire!) {
      expect(aim.velocity).toEqual(world.torpedoes[0].velocity);
      expect(aim.velocity.x).toBeLessThan(-2000); // moving fast, not standing still
      expect(aim.position).toEqual(world.torpedoes[0].position);
    }
  });
});
