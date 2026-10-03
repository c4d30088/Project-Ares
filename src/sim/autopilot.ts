// The nav computer. Each tick it turns a ship's order into a wanted bow direction and a
// wanted drive acceleration. Physics then turns the ship (at its class turn rate) and
// fires the drive only when the bow is aligned.

import { navTuning as N } from "../data/nav";
import { G0, shipClasses } from "../data/ships";
import type { NavPhase, SimEvent } from "./commands";
import { freshNavState } from "./commands";
import { angleBetween } from "./physics";
import { resolveTarget } from "./target";
import { add, dot, length, normalize, scale, sub, type Vec3 } from "./vec3";
import type { Ship, World } from "./world";

export interface NavOutput {
  /** Wanted bow direction (unit vector). */
  heading: Vec3;
  /** Wanted drive acceleration, m/s². */
  thrust: number;
  phase: NavPhase;
}

/** Fraction of full acceleration the braking plan assumes, leaving margin to correct. */
const BRAKE_MARGIN = 0.9;
/** Below this wanted acceleration (m/s²) the drive stays off and the bow holds. */
const MIN_THRUST = 1e-3;
/** The sim tick length. Kept local so the autopilot does not import the stepper. */
const DT_NAV = 1 / 20;

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
const hold = (ship: Ship): NavOutput => ({ heading: ship.heading, thrust: 0, phase: "hold" });

/** Phase label for a burn, depending on whether the bow is still turning. */
function burnPhase(ship: Ship, heading: Vec3, braking: boolean): NavPhase {
  const aligned = angleBetween(ship.heading, heading) <= (N.alignToleranceDeg * Math.PI) / 180;
  if (braking) return aligned ? "brake" : "flip";
  return aligned ? "burn" : "turn";
}

/**
 * Guidance to arrive at rest relative to a reference (a point, or a moving target).
 * r: reference position minus ship position. v: ship velocity minus reference velocity.
 * Accelerates toward the reference until the stopping distance (including the time to
 * turn the bow around) reaches the remaining distance, then flips and brakes at exactly
 * the deceleration needed to stop on it. Sideways drift is cancelled throughout.
 */
function arrive(
  ship: Ship,
  r: Vec3,
  v: Vec3,
  arriveDistance: number,
  arriveSpeed: number,
  events: SimEvent[],
  announceFlip = true,
): { out: NavOutput; arrived: boolean } {
  const a = maxAccel(ship);
  const d = length(r);
  if (d < arriveDistance && length(v) < arriveSpeed) return { out: hold(ship), arrived: true };

  // Final approach: inside the arrival distance the direction to the point is dominated by
  // tiny sideways errors, so just burn retrograde to kill the remaining speed.
  if (d < arriveDistance) {
    const speed = length(v);
    const thrust = Math.min(a, speed / DT_NAV);
    if (thrust < MIN_THRUST) return { out: hold(ship), arrived: false };
    const heading = scale(v, -1 / speed);
    return { out: { heading, thrust, phase: burnPhase(ship, heading, true) }, arrived: false };
  }

  const rHat = d > 1e-9 ? scale(r, 1 / d) : ship.heading;
  const vc = dot(v, rHat); // closing speed, positive toward the reference
  const vLat = sub(v, scale(rHat, vc));
  const nav = ship.nav;

  const timeToFaceBrake = angleBetween(ship.heading, scale(rHat, -1)) / turnRate(ship);
  const stopDistance = vc > 0 ? (vc * vc) / (2 * a * BRAKE_MARGIN) + vc * timeToFaceBrake : 0;

  if (!nav.braking && vc > 0 && stopDistance >= d) {
    nav.braking = true;
    // A flip is a reversal of the bow; small braking corrections are not flips.
    if (announceFlip && timeToFaceBrake * turnRate(ship) > Math.PI / 2) events.push({ type: "flipStart", ship: ship.id });
  } else if (nav.braking && vc <= 0) {
    nav.braking = false; // stopped short or drifted past: close in again
  }

  // Sideways drift is cancelled with a gentle time constant. While accelerating, the
  // sideways correction gets first claim on part of the thrust (lateralShare) and the rest
  // pushes toward the point;
  // while braking, stopping on the point comes first and sideways gets what is left.
  let aLat = length(vLat) < N.velocityDeadband ? { x: 0, y: 0, z: 0 } : scale(vLat, -1 / N.lateralTimeConstant);
  const capLat = (budget: number) => {
    const m = length(aLat);
    if (m > budget) aLat = scale(aLat, budget / m);
  };
  let aLong: number;
  if (nav.braking) {
    aLong = -Math.min(a, (vc * vc) / (2 * Math.max(d, 1e-3)));
    capLat(Math.sqrt(Math.max(0, a * a - aLong * aLong)));
  } else {
    capLat(a * N.lateralShare);
    aLong = Math.sqrt(Math.max(0, a * a - dot(aLat, aLat)));
  }

  const cmd = add(scale(rHat, aLong), aLat);
  const mag = length(cmd);
  if (mag < MIN_THRUST) return { out: hold(ship), arrived: false };
  const heading = scale(cmd, 1 / mag);
  return { out: { heading, thrust: Math.min(a, mag), phase: burnPhase(ship, heading, nav.braking) }, arrived: false };
}

function complete(ship: Ship, events: SimEvent[]) {
  if (!ship.order) return;
  events.push({ type: "orderComplete", ship: ship.id, order: ship.order.type });
}

export function navigate(world: World, ship: Ship, events: SimEvent[]): NavOutput {
  const order = ship.order;
  if (!order) return coast(ship);

  switch (order.type) {
    case "orient": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const heading = normalize(sub(t.position, ship.position));
      return { heading, thrust: 0, phase: "turn" };
    }

    case "burnTo": {
      const r = sub(order.point, ship.position);
      const { out, arrived } = arrive(ship, r, ship.velocity, N.arriveDistance, N.arriveSpeed, events);
      if (arrived) {
        complete(ship, events);
        // Arrived at rest: hold position at the point from now on.
        ship.order = { type: "stationKeep", target: { kind: "point", position: order.point }, offset: { x: 0, y: 0, z: 0 } };
        ship.nav = { ...freshNavState(), complete: true };
      }
      return out;
    }

    case "stationKeep": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const goal = add(t.position, order.offset);
      const r = sub(goal, ship.position);
      const v = sub(ship.velocity, t.velocity);
      // Drift freely inside the hold box; correct only when outside it.
      if (!ship.nav.braking && length(r) < N.stationHoldRadius && length(v) < N.stationHoldSpeed) return hold(ship);
      const { out, arrived } = arrive(ship, r, v, N.arriveDistance, N.arriveSpeed, events, false);
      if (arrived) ship.nav.braking = false;
      return out;
    }

    case "intercept": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const r = sub(t.position, ship.position);
      const v = sub(ship.velocity, t.velocity);
      if (order.mode === "rendezvous") return rendezvous(ship, r, v, events);
      return fastPass(ship, r, v, events);
    }

    case "matchVelocity": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const dv = sub(t.velocity, ship.velocity);
      const speed = length(dv);
      if (speed < N.matchSpeedTolerance) {
        if (!ship.nav.complete) {
          ship.nav.complete = true;
          complete(ship, events);
        }
        return hold(ship);
      }
      const heading = scale(dv, 1 / speed);
      return { heading, thrust: Math.min(maxAccel(ship), speed / DT_NAV), phase: burnPhase(ship, heading, false) };
    }
  }
}

/**
 * Rendezvous: arrive at rest relative to the target, stopping rendezvousStandoff short of
 * it along the line of approach. Then hold station there.
 */
function rendezvous(ship: Ship, r: Vec3, v: Vec3, events: SimEvent[]): NavOutput {
  const d = length(r);
  const aim = d > N.rendezvousStandoff ? sub(r, scale(r, N.rendezvousStandoff / d)) : { x: 0, y: 0, z: 0 };
  const { out, arrived } = arrive(ship, aim, v, N.rendezvousArriveDistance, N.rendezvousArriveSpeed, events);
  if (arrived && ship.order && "target" in ship.order) {
    complete(ship, events);
    ship.order = { type: "stationKeep", target: ship.order.target, offset: scale(r, -1) };
    ship.nav = { ...freshNavState(), complete: true };
  }
  return out;
}

/**
 * Time T for the ship, accelerating at a from now, to meet a coasting target:
 * |r + w T| = a T² / 2, where w is the target's velocity relative to the ship.
 */
export function interceptTime(r: Vec3, w: Vec3, a: number): number {
  const f = (T: number) => length(add(r, scale(w, T))) - 0.5 * a * T * T;
  let hi = 1;
  while (f(hi) > 0 && hi < 1e7) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Closing speed above which fast pass switches to miss-distance homing, m/s. */
const HOMING_MIN_CLOSING = 100;
/** Navigation gain for miss-distance homing (3 is the textbook choice). */
const HOMING_GAIN = 3;

/**
 * Fast pass: no flip, maximum closing speed. While not yet closing, aim the drive at
 * where the target will be when full thrust would reach it. Once closing, use
 * miss-distance homing: correct the predicted miss sideways and spend the rest of the
 * thrust pushing toward the target. Complete once closest approach is behind the ship.
 */
function fastPass(ship: Ship, r: Vec3, v: Vec3, events: SimEvent[]): NavOutput {
  const nav = ship.nav;
  const d = length(r);
  const closing = dot(v, r) > 0;
  if (closing) nav.closestApproach = Math.min(nav.closestApproach, d);
  else if (nav.closestApproach < Infinity) {
    // Was closing, now opening: the pass is done.
    complete(ship, events);
    ship.order = null;
    ship.nav = { ...freshNavState(), complete: true };
    return coast(ship);
  }

  const a = maxAccel(ship);
  const rHat = d > 1e-9 ? scale(r, 1 / d) : ship.heading;
  const vc = dot(v, rHat);
  let cmd: Vec3;
  if (vc > HOMING_MIN_CLOSING) {
    const tgo = d / vc;
    const miss = sub(r, scale(v, tgo)); // where the target ends up relative to us with no thrust
    const missPerp = sub(miss, scale(rHat, dot(miss, rHat)));
    let aCorr = scale(missPerp, HOMING_GAIN / (tgo * tgo));
    const m = length(aCorr);
    if (m > a) aCorr = scale(aCorr, a / m);
    const aLong = Math.sqrt(Math.max(0, a * a - dot(aCorr, aCorr)));
    cmd = add(aCorr, scale(rHat, aLong));
  } else {
    const w = scale(v, -1);
    const T = interceptTime(r, w, a);
    cmd = add(r, scale(w, T));
  }
  const heading = length(cmd) > 1e-9 ? normalize(cmd) : ship.heading;
  return { heading, thrust: a, phase: burnPhase(ship, heading, false) };
}
