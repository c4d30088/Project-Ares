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
import type { BodyKind, Ship, World } from "./world";

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
  pathLength?: number,
): { out: NavOutput; arrived: boolean } {
  const a = maxAccel(ship);
  // r points at the current aim (a detour point when a body is in the way); d is the
  // remaining distance along the route, which braking is planned against.
  const aimDistance = length(r);
  const d = pathLength ?? aimDistance;
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

  const rHat = aimDistance > 1e-9 ? scale(r, 1 / aimDistance) : ship.heading;
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

/** Safety radius around a body that routes keep out of. */
export function safetyRadius(radius: number): number {
  return radius * (1 + N.bodyMarginFraction) + N.bodyMarginMeters;
}

/** Inner radius a route never crosses, even inside the safety zone. */
export function hardRadius(radius: number, kind: BodyKind = "moon"): number {
  const f = kind === "asteroid" ? N.asteroidHardMarginFraction : N.roundBodyHardMarginFraction;
  return Math.min(radius * (1 + f) + N.bodyHardMarginMeters, safetyRadius(radius) * 0.98);
}

/**
 * Moves a destination out of every body's safety zone, to the nearest point on the zone's
 * edge. Used for burn-to and station-keep points (sim) and for the placement preview (UI).
 */
export function clampOutsideBodies(
  bodies: readonly { position: Vec3; radius: number }[],
  point: Vec3,
): { point: Vec3; clamped: boolean } {
  let p = { ...point };
  let clamped = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of bodies) {
      const R = safetyRadius(b.radius);
      const off = sub(p, b.position);
      const d = length(off);
      if (d >= R) continue;
      const dir = d > 1e-9 ? scale(off, 1 / d) : { x: 0, y: 0, z: 1 };
      p = add(b.position, scale(dir, R * 1.001));
      moved = clamped = true;
    }
    if (!moved) break;
  }
  return { point: p, clamped };
}

/** Closest distance from point c to the segment a-b, and the parameter t (0..1) there. */
function segmentDistance(a: Vec3, b: Vec3, c: Vec3): { dist: number; t: number; point: Vec3 } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(c, a), ab) / len2)) : 0;
  const point = add(a, scale(ab, t));
  return { dist: length(sub(c, point)), t, point };
}

/**
 * Where to aim to get from `from` to `goal` without crossing a body's safety zone.
 * If the straight line is clear, that is the goal itself. Otherwise it is a turning point
 * beside the nearest blocking body, pushed out until both legs clear its zone.
 * pathLength is the remaining distance along the route (used to plan braking).
 * With the ship or goal inside a safety zone, the route still keeps out of the body's
 * inner hard limit.
 */
export function routeAim(world: World, from: Vec3, goal: Vec3): { aim: Vec3; pathLength: number; detour: boolean } {
  let block: { c: Vec3; R: number; t: number; point: Vec3 } | null = null;
  for (const b of world.bodies) {
    // Normally keep out of the whole safety zone. If the ship or the goal is already inside
    // it (a target drifting close to a body, a ship that started there), still never cross
    // the body itself: fall back to the inner hard limit.
    let R = safetyRadius(b.radius);
    if (length(sub(goal, b.position)) < R || length(sub(from, b.position)) < R) R = hardRadius(b.radius, b.kind);
    if (length(sub(goal, b.position)) < R || length(sub(from, b.position)) < R) continue;
    const s = segmentDistance(from, goal, b.position);
    if (s.dist < R && (!block || s.t < block.t)) block = { c: b.position, R, t: s.t, point: s.point };
  }
  if (!block) return { aim: goal, pathLength: length(sub(goal, from)), detour: false };

  const { c, R } = block;
  // Go around on the side the straight line already passes; if it passes through the
  // center, pick a side deterministically (prefer passing over the top).
  let side = sub(block.point, c);
  if (length(side) < R * 1e-6) {
    const dir = normalize(sub(goal, from));
    const up = Math.abs(dir.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    side = sub(up, scale(dir, dot(up, dir)));
  }
  const u = normalize(side);
  let D = R * 1.02;
  let aim = add(c, scale(u, D));
  for (let i = 0; i < 80; i++) {
    aim = add(c, scale(u, D));
    if (segmentDistance(from, aim, c).dist >= R && segmentDistance(aim, goal, c).dist >= R) break;
    D *= 1.06;
  }
  return { aim, pathLength: length(sub(aim, from)) + length(sub(goal, aim)), detour: true };
}

/**
 * Heading and thrust toward a detour point without braking (fast pass): push toward the
 * point and cancel sideways drift relative to the (static) body frame.
 */
function pushToward(ship: Ship, aim: Vec3): NavOutput {
  const a = maxAccel(ship);
  const r = sub(aim, ship.position);
  const rHat = normalize(r);
  const vLat = sub(ship.velocity, scale(rHat, dot(ship.velocity, rHat)));
  let aLat = scale(vLat, -1 / N.lateralTimeConstant);
  const m = length(aLat);
  if (m > a * N.lateralShare) aLat = scale(aLat, (a * N.lateralShare) / m);
  const cmd = add(aLat, scale(rHat, Math.sqrt(Math.max(0, a * a - dot(aLat, aLat)))));
  const heading = normalize(cmd);
  return { heading, thrust: a, phase: burnPhase(ship, heading, false) };
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
      const route = routeAim(world, ship.position, order.point);
      const r = sub(route.aim, ship.position);
      const { out, arrived } = arrive(ship, r, ship.velocity, N.arriveDistance, N.arriveSpeed, events, true, route.pathLength);
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
      const route = routeAim(world, ship.position, goal);
      // Drift freely inside the hold box; correct only when outside it.
      if (!ship.nav.braking && length(r) < N.stationHoldRadius && length(v) < N.stationHoldSpeed) {
        // Reaching station after travelling completes the order (once). Starting inside the
        // box, or drifting back in later, does not.
        if (!ship.nav.complete && ship.nav.travelling) complete(ship, events);
        ship.nav.complete = true;
        ship.nav.travelling = false;
        return hold(ship);
      }
      ship.nav.travelling = true;
      // The first trip to station announces its flip like any trip; later small corrections
      // stay quiet so they never trigger auto-slowdown.
      const { out, arrived } = arrive(ship, sub(route.aim, ship.position), v, N.arriveDistance, N.arriveSpeed, events, !ship.nav.complete, route.pathLength);
      if (arrived) ship.nav.braking = false;
      return out;
    }

    case "intercept": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const r = sub(t.position, ship.position);
      const v = sub(ship.velocity, t.velocity);
      if (order.mode === "rendezvous") return rendezvous(world, ship, r, v, events);
      return fastPass(world, ship, r, v, events);
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
function rendezvous(world: World, ship: Ship, r: Vec3, v: Vec3, events: SimEvent[]): NavOutput {
  const d = length(r);
  const standoff = d > N.rendezvousStandoff ? sub(r, scale(r, N.rendezvousStandoff / d)) : { x: 0, y: 0, z: 0 };
  const route = routeAim(world, ship.position, add(ship.position, standoff));
  const aim = sub(route.aim, ship.position);
  const { out, arrived } = arrive(ship, aim, v, N.rendezvousArriveDistance, N.rendezvousArriveSpeed, events, true, route.pathLength);
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
function fastPass(world: World, ship: Ship, r: Vec3, v: Vec3, events: SimEvent[]): NavOutput {
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

  // A body in the way: go around it first, then home on the target.
  const route = routeAim(world, ship.position, add(ship.position, r));
  if (route.detour) return pushToward(ship, route.aim);

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
