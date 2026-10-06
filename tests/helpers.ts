// Small worlds for sim tests.

import { freshNavState } from "../src/sim/commands";
import { initHealth } from "../src/sim/damage";
import { initWeapons } from "../src/sim/weapons/torpedo";
import type { Ship, ShipClass, World } from "../src/sim/world";
import type { Vec3 } from "../src/sim/vec3";

/** A test ship. Its PDCs start on Hold, so guidance tests are not decided by kill rolls;
 *  PDC tests turn them on. (Scenario ships start on Auto.) */
export function makeShip(over: Partial<Ship> & { id: string; shipClass?: ShipClass }): Ship {
  const weapons = initWeapons(over.shipClass ?? "frigate");
  for (const m of weapons.pdcs) m.mode = "hold";
  return {
    name: over.id.toUpperCase(),
    faction: "blue",
    shipClass: "frigate",
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    heading: { x: 1, y: 0, z: 0 },
    thrust: 0,
    g: "cruise",
    order: null,
    nav: freshNavState(),
    health: initHealth(over.shipClass ?? "frigate"),
    strain: 0,
    casualtyS: 0,
    weapons,
    sensorsOn: false,
    loudS: 0,
    ...over,
  };
}

export function makeWorld(ships: Ship[]): World {
  return {
    tick: 0,
    rngState: 12345,
    pending: [],
    events: [],
    factions: [
      { id: "blue", name: "Blue", hostileTo: ["red"] },
      { id: "red", name: "Red", hostileTo: ["blue"] },
    ],
    ships,
    torpedoes: [],
    slugs: [],
    ai: [],
    aiGroups: {},
    stations: [],
    bodies: [],
    sensors: { blue: {}, red: {} },
    // Most sim tests are about physics and weapons, not sensors: everyone sees everything.
    // Sensor tests turn this off.
    perfectInfo: true,
  };
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
