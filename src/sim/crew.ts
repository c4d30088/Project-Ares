// G-strain and crew efficiency (DESIGN.md section 9). Strain builds while the drive pushes
// harder than the class's crew-safe Cruise G and drains at or below it. Strain and crew
// losses lower crew efficiency, which slows turns and worsens PDC fire. Holding full
// strain above Cruise G causes casualties.

import { crewTuning as CT } from "../data/crew";
import { G0, shipClasses } from "../data/ships";
import type { SimEvent } from "./commands";
import type { Ship, World } from "./world";

/** Crew efficiency, 1 = fresh and whole, lower under strain and with crew losses. */
export function crewEfficiency(ship: Ship): number {
  const strain = 1 - (1 - CT.efficiencyAtFullStrain) * ship.strain;
  const crew = CT.efficiencyAtNoCrew + (1 - CT.efficiencyAtNoCrew) * (ship.health.crew ?? 1);
  return strain * crew;
}

/** Updates strain from the drive acceleration actually applied this tick. */
export function updateStrain(world: World, dt: number, events: SimEvent[]): void {
  for (const ship of world.ships) {
    const cruise = shipClasses[ship.shipClass].cruiseG * G0;
    const excess = ship.thrust / cruise - 1;
    if (excess > 1e-6) {
      ship.strain = Math.min(1, ship.strain + (excess / CT.strainFillS) * dt);
      if (ship.strain >= 1) {
        ship.casualtyS += dt;
        if (ship.casualtyS >= CT.casualtyIntervalS) {
          ship.casualtyS -= CT.casualtyIntervalS;
          if ((ship.health.crew ?? 0) > 0) {
            ship.health.crew = Math.max(0, ship.health.crew - CT.casualtyDamage);
            events.push({ type: "crewCasualties", ship: ship.id });
          }
        }
      }
    } else {
      ship.strain = Math.max(0, ship.strain - dt / CT.strainRecoverS);
      ship.casualtyS = 0;
    }
  }
}
