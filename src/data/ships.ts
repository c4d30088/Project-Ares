// Ship class numbers. See docs/DESIGN.md section 14. Combat G is not in the design table;
// it starts halfway between Cruise and Max. Masses are placeholders until damage and
// momentum matter.

import type { ShipClass } from "../sim/world";

export const G0 = 9.81; // m/s² per g

export interface ShipClassData {
  massKg: number;
  cruiseG: number;
  combatG: number;
  maxG: number;
  /** Seconds to turn 180°. The main drive is off while turning. */
  flipTimeS: number;
}

export const shipClasses: Record<ShipClass, ShipClassData> = {
  corvette: { massKg: 4.0e5, cruiseG: 3, combatG: 5.5, maxG: 8, flipTimeS: 8 },
  frigate: { massKg: 1.2e6, cruiseG: 2, combatG: 4, maxG: 6, flipTimeS: 12 },
  destroyer: { massKg: 3.0e6, cruiseG: 2, combatG: 3.5, maxG: 5, flipTimeS: 18 },
  cruiser: { massKg: 1.2e7, cruiseG: 1.5, combatG: 2.75, maxG: 4, flipTimeS: 30 },
  capital: { massKg: 4.0e7, cruiseG: 1, combatG: 2, maxG: 3, flipTimeS: 45 },
};
