// Who can see what (M4 Sensors Lite, owner 2026-10-05). One rule set for every observer:
// a ship sees a contact when there is line of sight and any one of these holds:
//   loud       the contact's drive is burning (or stopped only moments ago), its Sensors are
//              on, or it just fired: seen at any range, even by a ship with Sensors off;
//   proximity  the contact is within sensorTuning.proximityRange;
//   sensors    the observer's Sensors are on and the contact is within sensorRange.
// Dark = coasting, Sensors off, not firing. Cold torpedoes follow the same rules.

import { sensorTuning as S } from "../../data/sensors";
import { segmentHitsSphere } from "../collide";
import { length, sub, type Vec3 } from "../vec3";
import type { Body, Ship, Torpedo } from "../world";

/** No body between a and b. */
export function lineOfSight(bodies: readonly Body[], a: Vec3, b: Vec3): boolean {
  for (const body of bodies) if (segmentHitsSphere(a, b, body.position, body.radius)) return false;
  return true;
}

export function isShip(e: Ship | Torpedo): e is Ship {
  return "shipClass" in e;
}

/** Seen at any range in line of sight. */
export function isLoud(e: Ship | Torpedo): boolean {
  if (isShip(e)) return e.thrust > 0 || e.sensorsOn || e.loudS > 0;
  return e.thrust > 0;
}

/** Which rule lets `observer` see `contact`, or null if it cannot. */
export function seenBecause(bodies: readonly Body[], observer: Ship, contact: Ship | Torpedo): "loud" | "proximity" | "sensors" | null {
  if (!lineOfSight(bodies, observer.position, contact.position)) return null;
  const d = length(sub(observer.position, contact.position));
  if (d <= S.proximityRange) return "proximity";
  if (isLoud(contact)) return "loud";
  if (observer.sensorsOn && d <= S.sensorRange) return "sensors";
  return null;
}

export function sees(bodies: readonly Body[], observer: Ship, contact: Ship | Torpedo): boolean {
  return seenBecause(bodies, observer, contact) !== null;
}

/**
 * Keeps each ship's "loud" timer: a drive that just stopped is still bright for a while,
 * and firing lights the ship up. Call once per tick after ships move.
 */
export function updateLoudness(ships: readonly Ship[], dt: number): void {
  for (const s of ships) {
    if (s.thrust > 0) s.loudS = Math.max(s.loudS, S.plumeFadeS);
    else s.loudS = Math.max(0, s.loudS - dt);
  }
}

/** Firing a weapon lights the ship up (hot torpedo launch, railgun, PDC). */
export function markFired(ship: Ship): void {
  ship.loudS = Math.max(ship.loudS, S.firedLoudS);
}
