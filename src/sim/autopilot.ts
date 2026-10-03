// The nav computer. Each tick it turns a ship's order into a wanted bow direction and a
// wanted drive acceleration. Physics then turns the ship (at its class turn rate) and
// fires the drive only when the bow is aligned.

import { navTuning as N } from "../data/nav";
import { G0, shipClasses } from "../data/ships";
import type { NavOrder, NavPhase, SimEvent } from "./commands";
import { freshNavState } from "./commands";
import { angleBetween } from "./physics";
import { bodyMu, gravityAt, type MassiveBody } from "./gravity";
import { driveFactor } from "./damage";
import { resolveTarget } from "./target";
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from "./vec3";
import type { Target } from "./target";
import type { Ship, World } from "./world";

export interface NavOutput {
  /** Wanted bow direction (unit vector). */
  heading: Vec3;
  /** Wanted drive acceleration, m/s². */
  thrust: number;
  phase: NavPhase;
  /** Gravity to cancel on top of the wanted thrust (the sim subtracts it). Guided burns
   *  cancel the pull on the ship (minus the pull on a moving target); coasting does not. */
  cancel?: Vec3;
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
  return g * G0 * driveFactor(ship);
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

/** Acceleration the ship can sustain crew-safe (its Cruise setting), m/s². */
export function cruiseAccel(ship: Ship): number {
  return shipClasses[ship.shipClass].cruiseG * G0;
}

/** Inner radius a route never crosses: the surface (with bumps) plus a little. */
export function hardRadius(b: MassiveBody): number {
  const f = b.kind === "asteroid" ? N.asteroidHardMarginFraction : N.roundBodyHardMarginFraction;
  return b.radius * (1 + f) + N.bodyHardMarginMeters;
}

/** Distance at which the body's pull equals a, m. */
export function noReturnRadius(b: MassiveBody, accel: number): number {
  return Math.sqrt(bodyMu(b) / accel);
}

/** Safety zone a route keeps out of: the hard limit, or the gravity point of no return
 *  for a ship with this sustained acceleration (with margin), whichever is larger. */
export function safetyRadius(b: MassiveBody, accel: number): number {
  return Math.max(hardRadius(b), noReturnRadius(b, accel / N.noReturnMargin));
}

/**
 * Moves a destination out of every body's safety zone, to the nearest point on the zone's
 * edge. Used for burn-to and station-keep points (sim) and for the placement preview (UI).
 */
export function clampOutsideBodies(
  bodies: readonly MassiveBody[],
  point: Vec3,
  accel: number,
): { point: Vec3; clamped: boolean } {
  let p = { ...point };
  let clamped = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of bodies) {
      const R = safetyRadius(b, accel);
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
export function routeAim(world: World, from: Vec3, goal: Vec3, accel: number): { aim: Vec3; pathLength: number; detour: boolean } {
  let block: { c: Vec3; R: number; t: number; point: Vec3 } | null = null;
  for (const b of world.bodies) {
    // Normally keep out of the whole safety zone. If the ship or the goal is already inside
    // it (a target drifting close to a body, a ship that started there), still never cross
    // the body itself: fall back to the inner hard limit.
    let R = safetyRadius(b, accel);
    if (length(sub(goal, b.position)) < R || length(sub(from, b.position)) < R) R = hardRadius(b);
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

/** Gravity on a target: zero for points and bodies (they do not fall) and for stations
 *  (they hold position); the local pull for anything else that moves. */
function targetGravity(world: World, target: Target): Vec3 {
  if (target.kind === "point") return { x: 0, y: 0, z: 0 };
  const moving = world.ships.find((s) => s.id === target.id) ?? world.torpedoes.find((t) => t.id === target.id);
  return moving ? gravityAt(world.bodies, moving.position) : { x: 0, y: 0, z: 0 };
}

const withCancel = (out: NavOutput, cancel: Vec3): NavOutput => ({ ...out, cancel });

function complete(ship: Ship, events: SimEvent[]) {
  if (!ship.order) return;
  events.push({ type: "orderComplete", ship: ship.id, order: ship.order.type });
}

export function navigate(world: World, ship: Ship, events: SimEvent[]): NavOutput {
  const order = ship.order;
  if (!order) return coast(ship);
  // Guided burns cancel gravity, so the guidance below can plan as if space were flat.
  const gShip = gravityAt(world.bodies, ship.position);

  switch (order.type) {
    case "orient": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const heading = normalize(sub(t.position, ship.position));
      return { heading, thrust: 0, phase: "turn" };
    }

    case "burnTo": {
      const route = routeAim(world, ship.position, order.point, cruiseAccel(ship));
      const r = sub(route.aim, ship.position);
      const { out, arrived } = arrive(ship, r, ship.velocity, N.arriveDistance, N.arriveSpeed, events, true, route.pathLength);
      if (arrived) {
        complete(ship, events);
        // Arrived at rest: hold position at the point from now on.
        ship.order = { type: "stationKeep", target: { kind: "point", position: order.point }, offset: { x: 0, y: 0, z: 0 } };
        ship.nav = { ...freshNavState(), complete: true };
      }
      return withCancel(out, gShip);
    }

    case "stationKeep": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const goal = add(t.position, order.offset);
      const r = sub(goal, ship.position);
      const v = sub(ship.velocity, t.velocity);
      const route = routeAim(world, ship.position, goal, cruiseAccel(ship));
      // Holding near a body means hovering against its pull (relative to a moving target,
      // only the difference in pull).
      const cancel = sub(gShip, targetGravity(world, order.target));
      // Drift freely inside the hold box; correct only when outside it.
      if (!ship.nav.braking && length(r) < N.stationHoldRadius && length(v) < N.stationHoldSpeed) {
        // Reaching station after travelling completes the order (once). Starting inside the
        // box, or drifting back in later, does not.
        if (!ship.nav.complete && ship.nav.travelling) complete(ship, events);
        ship.nav.complete = true;
        ship.nav.travelling = false;
        return withCancel(hold(ship), cancel);
      }
      ship.nav.travelling = true;
      // The first trip to station announces its flip like any trip; later small corrections
      // stay quiet so they never trigger auto-slowdown.
      const { out, arrived } = arrive(ship, sub(route.aim, ship.position), v, N.arriveDistance, N.arriveSpeed, events, !ship.nav.complete, route.pathLength);
      if (arrived) ship.nav.braking = false;
      return withCancel(out, cancel);
    }

    case "intercept": {
      const t = resolveTarget(world, order.target);
      if (!t) return coast(ship);
      const r = sub(t.position, ship.position);
      const v = sub(ship.velocity, t.velocity);
      const cancel = sub(gShip, targetGravity(world, order.target));
      if (order.mode === "rendezvous") return withCancel(rendezvous(world, ship, r, v, events), cancel);
      return withCancel(fastPass(world, ship, r, v, events), cancel);
    }

    case "orbit":
      return orbit(world, ship, order, gShip, events);

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
      const out = { heading, thrust: Math.min(maxAccel(ship), speed / DT_NAV), phase: burnPhase(ship, heading, false) };
      return withCancel(out, sub(gShip, targetGravity(world, order.target)));
    }
  }
}

/**
 * Orbit: fly to the entry point and stop (approach), burn up to circular orbital speed
 * (insert), then coast with the drive off (orbit), correcting only if the orbit drifts.
 * Insert and corrections steer the velocity toward a field that is circular at the right
 * radius and in the right plane, with gravity providing the turn.
 */
function orbit(world: World, ship: Ship, order: NavOrder & { type: "orbit" }, gShip: Vec3, events: SimEvent[]): NavOutput {
  const t = order.target;
  const body = t.kind !== "point" ? world.bodies.find((b) => b.id === t.id) : undefined;
  if (!body) return coast(ship);
  const nav = ship.nav;
  const c = body.position;

  if (nav.orbitStage === "approach") {
    const goal = add(c, order.entry);
    const route = routeAim(world, ship.position, goal, cruiseAccel(ship));
    const { out, arrived } = arrive(ship, sub(route.aim, ship.position), ship.velocity, N.arriveDistance, N.arriveSpeed, events, true, route.pathLength);
    if (arrived) {
      nav.orbitStage = "insert";
      nav.braking = false;
    }
    return withCancel(out, gShip);
  }

  const R = order.radius;
  const n = order.normal;
  const vc = Math.sqrt(bodyMu(body) / R);
  const r = sub(ship.position, c);
  const d = length(r);
  const rHat = scale(r, 1 / d);
  const along = normalize(cross(n, rHat)); // direction of travel, counter-clockwise about n
  const eR = R - d; // positive: too low
  const eN = dot(r, n); // out of plane
  const vMax = Math.max(2, 0.05 * vc);
  const clampV = (x: number) => Math.max(-vMax, Math.min(vMax, x));
  const k = (N.orbitRadialGain * vc) / R; // gentle, relative to the orbit's own angular rate
  const vDes = add(add(scale(along, vc), scale(rHat, clampV(k * eR))), scale(n, clampV(-k * eN)));
  const dv = sub(vDes, ship.velocity);

  const dvTol = Math.max(0.05, 0.002 * vc);
  const posTol = 0.005 * R;
  const settled = length(dv) < dvTol && Math.abs(eR) < posTol && Math.abs(eN) < posTol;

  if (nav.orbitStage === "insert") {
    if (settled) {
      nav.orbitStage = "orbit";
      nav.complete = true;
      nav.braking = false;
      complete(ship, events);
      return { heading: ship.heading, thrust: 0, phase: "orbit" };
    }
  } else {
    // In orbit: coast; correct only once the orbit has clearly drifted, until settled again.
    const drifted = length(dv) > 5 * dvTol || Math.abs(eR) > 4 * posTol || Math.abs(eN) > 4 * posTol;
    if (nav.braking && settled) nav.braking = false;
    else if (!nav.braking && drifted) nav.braking = true;
    if (!nav.braking) return { heading: ship.heading, thrust: 0, phase: "orbit" };
  }

  // Thrust = keep turning with the circle, minus what gravity already does, plus closing
  // the velocity error. In a perfect orbit this is zero.
  const turning = scale(rHat, -(vc * vc) / d);
  const cmd = add(sub(turning, gShip), scale(dv, 1 / N.orbitTimeConstant));
  const mag = length(cmd);
  if (mag < MIN_THRUST) return { heading: ship.heading, thrust: 0, phase: "orbit" };
  const heading = scale(cmd, 1 / mag);
  return { heading, thrust: mag, phase: burnPhase(ship, heading, false) };
}

/**
 * Rendezvous: arrive at rest relative to the target, stopping rendezvousStandoff short of
 * it along the line of approach. Then hold station there.
 */
function rendezvous(world: World, ship: Ship, r: Vec3, v: Vec3, events: SimEvent[]): NavOutput {
  const d = length(r);
  const standoff = d > N.rendezvousStandoff ? sub(r, scale(r, N.rendezvousStandoff / d)) : { x: 0, y: 0, z: 0 };
  const route = routeAim(world, ship.position, add(ship.position, standoff), cruiseAccel(ship));
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
  const route = routeAim(world, ship.position, add(ship.position, r), cruiseAccel(ship));
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
