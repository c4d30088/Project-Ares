// The nav computer. Each tick it turns a ship's order into a wanted bow direction and a
// wanted drive acceleration. Physics then turns the ship (at its class turn rate) and
// fires the drive only when the bow is aligned.

import { G0, shipClasses } from "../data/ships";
import type { NavPhase, SimEvent } from "./commands";
import { resolveTarget } from "./target";
import { normalize, sub, type Vec3 } from "./vec3";
import type { Ship, World } from "./world";

export interface NavOutput {
  /** Wanted bow direction (unit vector). */
  heading: Vec3;
  /** Wanted drive acceleration, m/s². */
  thrust: number;
  phase: NavPhase;
}

/** Drive acceleration available at the ship's current G setting, m/s². */
export function maxAccel(ship: Ship): number {
  const cls = shipClasses[ship.shipClass];
  const g = ship.g === "cruise" ? cls.cruiseG : ship.g === "combat" ? cls.combatG : cls.maxG;
  return g * G0;
}

/** Turn rate in rad/s, from the class flip time (180° in flipTimeS). */
export function turnRate(ship: Ship): number {
  return Math.PI / shipClasses[ship.shipClass].flipTimeS;
}

const coast = (ship: Ship): NavOutput => ({ heading: ship.heading, thrust: 0, phase: "coast" });

export function navigate(world: World, ship: Ship, _events: SimEvent[]): NavOutput {
  const order = ship.order;
  if (!order) return coast(ship);

  switch (order.type) {
    case "orient": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const heading = normalize(sub(t.position, ship.position));
      return { heading, thrust: 0, phase: "turn" };
    }
    default:
      // Movement orders arrive in the next M2 steps.
      return coast(ship);
  }
}
