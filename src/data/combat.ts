// Combat tunables: loadouts per class (DESIGN.md section 14), hit sizes and damage.
// Damage is a fraction of a subsystem's health (1 = intact, 0 = destroyed).

import type { ShipClass } from "../sim/world";

export interface Loadout {
  pdcCount: number;
  /** Half-angle of each PDC mount's firing arc, degrees. */
  pdcArcDeg: number;
  tubes: number;
  magazine: number;
  railgun: "none" | "light" | "spinal";
  railguns: number;
}

export const loadouts: Record<ShipClass, Loadout> = {
  corvette: { pdcCount: 2, pdcArcDeg: 110, tubes: 2, magazine: 8, railgun: "none", railguns: 0 },
  frigate: { pdcCount: 4, pdcArcDeg: 110, tubes: 2, magazine: 12, railgun: "light", railguns: 1 },
  destroyer: { pdcCount: 8, pdcArcDeg: 110, tubes: 4, magazine: 16, railgun: "light", railguns: 1 },
  cruiser: { pdcCount: 10, pdcArcDeg: 110, tubes: 6, magazine: 30, railgun: "spinal", railguns: 1 },
  capital: { pdcCount: 16, pdcArcDeg: 110, tubes: 8, magazine: 48, railgun: "spinal", railguns: 2 },
};

export const combatTuning = {
  /** Radius a slug or PDC stream must pass within to hit a ship, meters. */
  hitRadius: { corvette: 40, frigate: 60, destroyer: 90, cruiser: 150, capital: 250 } as Record<ShipClass, number>,
  /** Torpedo warhead: hull damage, and damage to the subsystem struck. */
  torpedoHull: 0.35,
  torpedoSubsystem: 0.7,
  /** Railgun slug. */
  slugHull: 0.25,
  slugSubsystem: 0.5,
  /** Drive output at zero drive health, as a fraction of full (0 = dead drive). */
  driveFloor: 0,
};

/** Which subsystems a hit from each side can strike, with relative weights. */
export const hitSectors = {
  front: { sensors: 0.35, railgun: 0.35, crew: 0.2, tubes: 0.1 },
  rear: { drive: 0.55, reactor: 0.3, radiators: 0.15 },
  side: { pdc: 0.4, tubes: 0.25, radiators: 0.2, crew: 0.15 },
  topBottom: { radiators: 0.35, pdc: 0.35, sensors: 0.2, crew: 0.1 },
} as const;
