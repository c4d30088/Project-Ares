// Running dark (DESIGN.md section 8, M4 Sensors Lite): a dark ship keeps its radiators in,
// so heat builds; a loud ship (drive burning, Sensors on, just fired) runs its radiators
// and cools. To cool down you must show yourself. At full heat, crew and radiators take
// slow damage. Damaged radiators make the heat build faster.

import { sensorTuning as S } from "../data/sensors";
import type { SimEvent } from "./commands";
import { isLoud } from "./sensors/detect";
import type { World } from "./world";

export function updateHeat(world: World, dt: number, events: SimEvent[]): void {
  for (const ship of world.ships) {
    const limit = S.darkLimitS[ship.shipClass] * Math.max(0.25, ship.health.radiators ?? 1);
    if (isLoud(ship)) {
      ship.heat = Math.max(0, ship.heat - (dt * S.coolFactor) / limit);
      ship.overheatS = 0;
      continue;
    }
    ship.heat = Math.min(1, ship.heat + dt / limit);
    if (ship.heat < 1) continue;
    ship.overheatS += dt;
    if (ship.overheatS >= S.heatDamageIntervalS) {
      ship.overheatS -= S.heatDamageIntervalS;
      ship.health.crew = Math.max(0, (ship.health.crew ?? 1) - S.heatDamage);
      ship.health.radiators = Math.max(0, (ship.health.radiators ?? 1) - S.heatDamage);
      events.push({ type: "overheat", ship: ship.id });
    }
  }
}
