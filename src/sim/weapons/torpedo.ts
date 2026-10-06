// Torpedoes (DESIGN.md section 7): launch from tubes, guidance, fuel, seeker, mines and
// the proximity fuse. Torpedoes turn instantly (they are small); their drive is limited
// by acceleration and by the delta-v budget.

import { combatTuning as C, loadouts } from "../../data/combat";
import { torpedoTuning as TT } from "../../data/weapons";
import { G0 } from "../../data/ships";
import { interceptTime, routeAim, swerveDirection } from "../autopilot";
import { initBurst, initPdcs } from "./pdc";
import { initRailguns } from "./railgun";
import { navTuning as N } from "../../data/nav";
import { closestApproach } from "../collide";
import { gravityAt } from "../gravity";
import type { SimEvent } from "../commands";
import { applyHit, destroy } from "../damage";
import { shipFrame } from "../shipFrame";
import { resolveTarget, type ResolvedTarget, type Target } from "../target";
import { sensorTuning as S } from "../../data/sensors";
import { isLoud, lineOfSight } from "../sensors/detect";
import { sideSees } from "../sensors/tracks";
import { TICK_RATE } from "../sim";
import { add, dot, length, normalize, scale, sub, type Vec3 } from "../vec3";
import { areHostile, type LaunchMode, type Ship, type ShipClass, type Torpedo, type Weapons, type World } from "../world";

/** Closing speed above which homing switches to miss-distance correction, m/s. */
const HOMING_MIN_CLOSING = 100;
/** Navigation gain for miss-distance homing. */
const HOMING_GAIN = 3;
/** Corrections smaller than this are skipped to save fuel, m/s². */
const MIN_CORRECTION = 0.05;
/** The boost takes out the predicted miss on this time constant, s. */
const BOOST_LATERAL_S = 1;
/** During the boost, sideways correction may use at most this fraction of thrust. */
const BOOST_LATERAL_SHARE = 0.6;
/** Turns at a route corner smaller than this (radians) are ignored for bend speed. */
const MIN_BEND = (5 * Math.PI) / 180;
/** A point-targeted torpedo flies at this fraction of what it can afford, so it can stop. */
const POINT_BRAKE_MARGIN = 0.8;

export function torpedoAccel(): number {
  return TT.accelG * G0;
}

export function initWeapons(cls: ShipClass): Weapons {
  const lo = loadouts[cls];
  return { magazine: lo.magazine, tubeReload: new Array(lo.tubes).fill(0), launchQueue: [], launched: 0, salvos: 0, pdcs: initPdcs(cls), pdcBurst: initBurst(), ...initRailguns(cls) };
}

/** Queues torpedoes. Returns a reason if the order cannot be carried out. */
export function queueLaunch(world: World, ship: Ship, target: Target, count: number, mode: LaunchMode): string | null {
  const w = ship.weapons;
  if (!w.tubeReload.length) return "no torpedo tubes";
  if ((ship.health.tubes ?? 0) <= 0) return "tubes destroyed";
  if (target.kind !== "point" && !resolveTarget(world, target, ship.faction)) return "unknown target";
  const n = Math.min(Math.floor(count), w.magazine);
  if (n <= 0) return w.magazine <= 0 ? "magazine empty" : "no torpedoes ordered";
  w.magazine -= n;
  w.salvos++;
  for (let i = 0; i < n; i++) w.launchQueue.push({ target: structuredClone(target), mode, salvo: w.salvos });
  return null;
}

/** Fires queued torpedoes from ready tubes and counts down reloads. */
export function runLaunchers(world: World, dt: number, events: SimEvent[]): void {
  for (const ship of world.ships) {
    const w = ship.weapons;
    // Damaged tubes reload slower; destroyed tubes do not fire.
    const health = ship.health.tubes ?? 0;
    for (let i = 0; i < w.tubeReload.length; i++) {
      if (w.tubeReload[i] > 0) w.tubeReload[i] = Math.max(0, w.tubeReload[i] - dt);
      if (w.tubeReload[i] > 0 || !w.launchQueue.length || health <= 0) continue;
      const order = w.launchQueue.shift()!;
      const t = launch(world, ship, i, order.target, order.mode);
      // Salvo hold: wait, dark, for the rest of the salvo (see guideTorpedo).
      if (TT.salvoHold && order.mode === "hot" && w.launchQueue.some((q) => q.salvo === order.salvo)) {
        t.guidance!.stage = "cold";
        t.guidance!.holdSalvo = order.salvo;
      }
      w.tubeReload[i] = TT.tubeReloadS / Math.max(0.25, health);
      events.push({ type: "torpedoLaunched", ship: ship.id, torpedo: t.id, faction: ship.faction, mode: order.mode });
    }
  }
}

function launch(world: World, ship: Ship, tube: number, target: Target, mode: LaunchMode): Torpedo {
  ship.weapons.launched++;
  const id = `${ship.id}-T${String(ship.weapons.launched).padStart(2, "0")}`;
  // Hot: pushed out sideways to clear the tubes, drive lit at once. Cold: pushed out toward
  // the target and left to coast dark.
  const f = shipFrame(ship.heading);
  // Aimed from what the launcher's side knows (a lost contact: along its last course).
  const t = resolveTarget(world, target, ship.faction);
  const toward = t ? normalize(sub(t.position, ship.position)) : f.forward;
  const side = scale(f.left, tube % 2 === 0 ? 1 : -1);
  const eject = mode === "hot" ? scale(side, TT.hotEjectSpeed) : scale(toward, TT.coldEjectSpeed);
  const torpedo: Torpedo = {
    id,
    faction: ship.faction,
    position: { ...ship.position },
    velocity: add(ship.velocity, eject),
    heading: mode === "hot" ? side : toward,
    thrust: 0,
    guidance: {
      target,
      launcher: ship.id,
      mode,
      stage: mode === "cold" ? "cold" : "flight",
      fuel: TT.deltaV,
      reserve: TT.terminalReserve,
      searchS: 0,
      ...(t && target.kind === "track" ? { seen: { position: { ...t.position }, velocity: { ...t.velocity }, tick: world.tick } } : {}),
    },
  };
  world.torpedoes.push(torpedo);
  return torpedo;
}

/**
 * Can a torpedo's seeker see this ship or torpedo (M4 Sensors Lite)? It needs line of sight,
 * and the contact must be loud, within proximity range of the torpedo, or seen by the
 * torpedo's side (one datalink network per side).
 */
export function torpedoSees(world: World, t: Torpedo, e: Ship | Torpedo): boolean {
  if (world.perfectInfo) return true;
  if (!lineOfSight(world.bodies, t.position, e.position)) return false;
  return isLoud(e) || length(sub(e.position, t.position)) <= S.proximityRange || sideSees(world, t.faction, e.id);
}

/** Nearest hostile ship within seeker range that the seeker can see. */
function seek(world: World, t: Torpedo): Ship | null {
  let best: Ship | null = null;
  let bestD = TT.seekerRange;
  for (const s of world.ships) {
    if (s.destroyed || !areHostile(world, t.faction, s.faction) || !torpedoSees(world, t, s)) continue;
    const d = length(sub(s.position, t.position));
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/**
 * Predicted miss if the torpedo stops thrusting now: where the target will be, relative
 * to the torpedo, at the moment of closest approach, sideways to the line of sight.
 * Leads the target's acceleration as well as its velocity. r: target minus torpedo
 * position. v: torpedo minus target velocity. aT: target minus torpedo acceleration,
 * leaving out the torpedo's own drive.
 */
function zeroEffortMiss(r: Vec3, v: Vec3, aT: Vec3, tgo: number): Vec3 {
  const rHat = normalize(r);
  const miss = add(sub(r, scale(v, tgo)), scale(aT, 0.5 * tgo * tgo));
  return sub(miss, scale(rHat, dot(miss, rHat)));
}

/** Time to cover distance d closing at vc, still burning boostLeft m/s at a first. */
export function timeToGo(d: number, vc: number, a: number, boostLeft: number): number {
  const tb = boostLeft / a;
  const dBoost = vc * tb + 0.5 * a * tb * tb;
  if (d <= dBoost) return (-vc + Math.sqrt(vc * vc + 2 * a * d)) / a;
  return tb + (d - dBoost) / (vc + a * tb);
}

/**
 * Not yet closing: aim the drive at where full thrust would meet the target. Closing:
 * correct the predicted miss, either at once (during the boost, with boostLeft m/s still
 * to burn: a collision course) or by proportional navigation, which spreads it over the
 * time left. With `push`, the rest of the thrust closes in faster.
 */
function homing(r: Vec3, v: Vec3, aT: Vec3, a: number, push: boolean, boostLeft = 0, atOnce = boostLeft > 0): Vec3 {
  const d = length(r);
  const rHat = d > 1e-9 ? scale(r, 1 / d) : { x: 1, y: 0, z: 0 };
  const vc = dot(v, rHat);
  if (vc <= HOMING_MIN_CLOSING) {
    if (!push) return { x: 0, y: 0, z: 0 };
    const w = scale(v, -1);
    return scale(normalize(add(r, scale(w, interceptTime(r, w, a)))), a);
  }
  const tgo = timeToGo(d, vc, a, boostLeft);
  const zem = zeroEffortMiss(r, v, aT, tgo);
  let aCorr = atOnce ? scale(zem, 1 / (tgo * BOOST_LATERAL_S)) : scale(zem, HOMING_GAIN / (tgo * tgo));
  // The boost always keeps part of its thrust for closing in: chasing an accelerating
  // target purely sideways never shortens the flight, so the chase never ends.
  const cap = boostLeft > 0 ? a * BOOST_LATERAL_SHARE : a;
  const m = length(aCorr);
  if (m > cap) aCorr = scale(aCorr, cap / m);
  if (!push) return aCorr;
  return add(aCorr, scale(rHat, Math.sqrt(Math.max(0, a * a - dot(aCorr, aCorr)))));
}

/** Sideways miss final homing can still take out with `fuel` m/s, m (with margin). */
function terminalReach(fuel: number, a: number): number {
  const burn = Math.min(fuel / a, TT.terminalPhaseS);
  return 0.5 * a * burn * (2 * TT.terminalPhaseS - burn) * 0.5;
}

/**
 * Boost around a body: fly toward the corner of the route, but only as fast as still
 * leaves the fuel to turn at the corner onto the leg to the target. Turning a speed v by
 * an angle θ costs about 2·v·sin(θ/2), so the first leg gets 1 / (1 + 2·sin(θ/2)) of
 * what the boost can still give. Curving round the body follows its route circle, so it
 * needs a speed the drive can hold on that curve (v² / radius within half the thrust),
 * whatever the angle: round a small rock that is slow. The torpedo brakes for it in time,
 * like braking for a bend.
 */
function aroundBody(t: Torpedo, route: { aim: Vec3; center?: Vec3; radius?: number }, meet: Vec3, boostLeft: number, a: number, dt: number): Vec3 {
  const corner = route.aim;
  const toCorner = sub(corner, t.position);
  const leg1 = normalize(toCorner);
  const leg2 = normalize(sub(meet, corner));
  const turn = Math.acos(Math.max(-1, Math.min(1, dot(leg1, leg2))));
  const vCap = (length(t.velocity) + boostLeft) / (1 + 2 * Math.sin(turn / 2));
  // The bend starts where the path first touches the circle round the body.
  const R = route.radius ?? Infinity;
  const dc = route.center ? length(sub(t.position, route.center)) : Infinity;
  const toBend = Math.sqrt(Math.max(0, dc * dc - R * R));
  const vBend = turn > MIN_BEND ? Math.sqrt(0.5 * a * R + 2 * a * POINT_BRAKE_MARGIN * toBend) : Infinity;
  // Steer onto the leg. Add speed only up to the fuel cap (braking for that would waste
  // it); brake only for a bend.
  const vAlong = dot(t.velocity, leg1);
  const vLat = sub(t.velocity, scale(leg1, vAlong));
  const along = vAlong > vBend ? vBend - vAlong : Math.max(0, Math.min(vCap, vBend) - vAlong);
  const dv = sub(scale(leg1, along), vLat);
  const m = length(dv);
  if (m < 1) return { x: 0, y: 0, z: 0 };
  return scale(dv, Math.min(a, m / dt) / m);
}

/** Velocity field to stop at a point: cruise at what the fuel allows, brake in time.
 *  Routed around bodies in the way (braking planned over the whole route). */
function toPoint(world: World, t: Torpedo, point: Vec3, a: number, dt: number): Vec3 {
  const route = routeAim(world, t.position, point, a, t.velocity);
  const r = sub(route.aim, t.position);
  const d = length(r);
  const cruise = (TT.deltaV - TT.terminalReserve) / 2;
  const vWant = Math.min(cruise, Math.sqrt(2 * a * POINT_BRAKE_MARGIN * route.pathLength));
  const want = d > 1e-9 ? scale(r, vWant / d) : { x: 0, y: 0, z: 0 };
  const dv = sub(want, t.velocity);
  const m = length(dv);
  if (m < 1) return { x: 0, y: 0, z: 0 };
  return scale(dv, Math.min(a, m / dt) / m);
}

/**
 * What a torpedo knows of its target. A ship or torpedo target is exact while the seeker
 * sees it (torpedoSees); out of sight the torpedo flies on the last position and motion it
 * saw (its intercept line turns orange), and picks the target up again if it comes back
 * into view. Objects and points are charted. Null if it has never seen the target and its
 * side has forgotten it, or the target is gone in view. `update` records what is seen (the
 * flight does; predictions do not).
 */
export function seekerView(world: World, t: Torpedo, update: boolean): ResolvedTarget | null {
  const g = t.guidance!;
  if (g.target.kind !== "track" || world.perfectInfo) return resolveTarget(world, g.target);
  const id = g.target.id;
  const e = world.ships.find((s) => s.id === id) ?? world.torpedoes.find((x) => x.id === id);
  if (e && !e.destroyed && torpedoSees(world, t, e)) {
    if (update) {
      g.seen = { position: { ...e.position }, velocity: { ...e.velocity }, tick: world.tick };
      g.blind = false;
    }
    return resolveTarget(world, g.target);
  }
  if (!e || e.destroyed) {
    // Gone. If it was in the seeker's view a moment ago, the torpedo knows.
    if (!g.seen || world.tick - g.seen.tick <= 1) return null;
  }
  if (update) g.blind = true;
  if (!g.seen) return null;
  const age = (world.tick - g.seen.tick) / TICK_RATE;
  return { position: add(g.seen.position, scale(g.seen.velocity, age)), velocity: { ...g.seen.velocity }, thrust: { x: 0, y: 0, z: 0 } };
}

/** One tick of guidance: sets heading and thrust and spends fuel. May expire the torpedo. */
export function guideTorpedo(world: World, t: Torpedo, dt: number, events: SimEvent[]): void {
  const g = t.guidance;
  if (!g) return; // scenario prop: flies straight at its set thrust
  const a = torpedoAccel();
  let tgt = seekerView(world, t, true);
  let cmd: Vec3 = { x: 0, y: 0, z: 0 };
  // The reserve is for final homing (and for settling as a mine); the boost and the
  // flight to a point leave it alone.
  let useReserve = false;
  // A torpedo aimed at a body may fly into it; every other body is in the way.
  const skip = g.target.kind === "object" ? g.target.id : undefined;

  if (g.stage === "cold" && g.holdSalvo !== undefined) {
    // Holding for the rest of the salvo: light together once the last is out of its tube
    // (or the launcher is gone).
    const launcher = world.ships.find((s) => s.id === g.launcher);
    if (!launcher || !launcher.weapons.launchQueue.some((q) => q.salvo === g.holdSalvo)) {
      g.stage = "flight";
      delete g.holdSalvo;
    }
  } else if (g.stage === "cold") {
    // Coast dark; light the drive inside ignition range, or once the range starts opening.
    if (tgt) {
      const r = sub(tgt.position, t.position);
      const opening = dot(r, sub(t.velocity, tgt.velocity)) < 0;
      if (length(r) < TT.coldIgnitionDistance || opening) g.stage = "flight";
    } else g.stage = "search";
  }

  // Target gone, or arrived at its point: the seeker takes over.
  if (g.stage === "flight" && (!tgt || (g.target.kind === "point" && length(sub(tgt.position, t.position)) < TT.pointArrival))) {
    g.stage = "search";
  }

  if (g.stage === "search") {
    g.searchS += dt;
    const found = seek(world, t);
    if (found) {
      // A new engagement: split the fuel left the way a fresh launch does.
      g.target = { kind: "track", id: found.id };
      g.stage = "flight";
      g.reserve = g.fuel * (TT.terminalReserve / TT.deltaV);
      delete g.seen;
      delete g.aEst;
      tgt = seekerView(world, t, true);
    } else if (g.searchS >= TT.mineLifetimeS) {
      events.push({ type: "torpedoExpired", torpedo: t.id, reason: "timeout" });
      destroy(world, t, "timeout");
      return;
    } else if (g.target.kind === "point") {
      cmd = toPoint(world, t, g.target.position, a, dt); // settle at the point as a mine
      useReserve = true;
    }
  }

  if (g.stage === "flight" && tgt) {
    if (g.target.kind === "point") cmd = toPoint(world, t, tgt.position, a, dt);
    else {
      const r = sub(tgt.position, t.position);
      const v = sub(t.velocity, tgt.velocity);
      // Lead the target's average drive acceleration, not this instant's: a corkscrewing
      // target's thrust keeps turning, and leading each instant would chase phantoms.
      const k = Math.min(1, dt / Math.max(dt, TT.targetAccelSmoothS));
      g.aEst = g.aEst ? add(g.aEst, scale(sub(tgt.thrust, g.aEst), k)) : { ...tgt.thrust };
      const aT = sub(add(g.aEst, gravityAt(world.bodies, tgt.position)), gravityAt(world.bodies, t.position));
      const vc = dot(v, normalize(r));
      const tgo = vc > 0 ? length(r) / vc : Infinity;
      const boosting = g.fuel > g.reserve;
      // Coasting, the drive stays dark unless the target has moved so far off the
      // collision course that final homing could not fix it: then correct now, which
      // costs far less than correcting late.
      const zem = vc > 0 ? length(zeroEffortMiss(r, v, aT, tgo)) : 0;
      if (boosting) {
        // A body between the torpedo and where it will meet the target: boost around its
        // edge first (the route the nav computer uses), then home.
        const boostLeft = g.fuel - g.reserve;
        const meet = add(tgt.position, scale(tgt.velocity, timeToGo(length(r), Math.max(0, vc), a, boostLeft)));
        const route = routeAim(world, t.position, meet, a, t.velocity, skip);
        if (route.detour) cmd = aroundBody(t, route, meet, boostLeft, a, dt);
        // Close in (a short shot, or just round a body): final homing, with the whole
        // thrust free for the correction, still pushing with what the boost has left.
        else if (vc > 0 && tgo < TT.terminalPhaseS) cmd = homing(r, v, aT, a, true);
        else cmd = homing(r, v, aT, a, true, boostLeft);
      } else if (vc > 0 && routeAim(world, t.position, add(tgt.position, scale(tgt.velocity, tgo)), a, t.velocity, skip).detour) {
        // Still going round a body: hold the course (the swerve guards the edge) and correct
        // once the way to the target is clear.
      } else if (tgo < TT.terminalPhaseS) {
        cmd = homing(r, v, aT, a, false);
        useReserve = true;
      } else if (vc > 0 && zem > terminalReach(g.fuel, a)) {
        // Mid-course: one firm correction back onto a collision course, then dark again.
        cmd = homing(r, v, aT, a, false, 0, true);
        useReserve = true;
      } else if (vc <= 0) {
        // No fuel to chase with and the range is opening: missed or out-run. Spent.
        events.push({ type: "torpedoExpired", torpedo: t.id, reason: "spent" });
        destroy(world, t, "spent");
        return;
      }
    }
  }

  // Last line of defence: if the flight is about to end in a body it was not aimed at,
  // swerve at full thrust, reserve and all. A cold torpedo lights its drive to do it.
  if (g.stage !== "search" || g.target.kind === "point") {
    const dir = swerveDirection(world.bodies, t.position, t.velocity, t.heading, a, Infinity, N.avoidLookaheadExtraS, false, skip, true);
    if (dir) {
      if (g.stage === "cold") g.stage = "flight";
      cmd = scale(dir, a);
      useReserve = true;
    }
  }

  const budget = useReserve ? g.fuel : Math.max(0, g.fuel - g.reserve);
  let thrust = length(cmd);
  if (thrust < MIN_CORRECTION) thrust = 0;
  thrust = Math.min(thrust, a, budget / dt);
  if (thrust > 0) t.heading = normalize(cmd);
  t.thrust = thrust;
  g.fuel = Math.max(0, g.fuel - thrust * dt);
}

/**
 * Where and when a torpedo will strike, for the intercept lines and impact countdowns.
 * Assumes the target keeps coasting (the player knows where it is and how it moves, not
 * what it intends) and the torpedo flies its plan: any boost left, then the coast. For a
 * point it is the arrival at the point. Null for mines and seekers still searching, and
 * for a torpedo that is opening on its target with no boost left (it will miss).
 */
export function predictImpact(world: World, t: Torpedo): { position: Vec3; t: number; targetId: string | null } | null {
  const g = t.guidance;
  if (!g || g.stage === "search") return null;
  const tgt = seekerView(world, t, false);
  if (!tgt) return null;
  const a = torpedoAccel();
  const r = sub(tgt.position, t.position);
  const d = length(r);
  const vc = d > 1e-9 ? dot(sub(t.velocity, tgt.velocity), scale(r, 1 / d)) : 0;
  const targetId = g.target.kind === "point" ? null : g.target.id;

  if (g.target.kind === "point") {
    // Accelerate to cruise, cruise, brake to a stop (the toPoint velocity field).
    const cruise = (TT.deltaV - TT.terminalReserve) / 2;
    const v0 = Math.max(0, Math.min(vc, cruise));
    const tAcc = (cruise - v0) / a;
    const dAcc = ((v0 + cruise) / 2) * tAcc;
    const tBrake = cruise / (a * POINT_BRAKE_MARGIN);
    const dBrake = (cruise * tBrake) / 2;
    const rest = d - dAcc - dBrake;
    const time = rest >= 0 ? tAcc + tBrake + rest / cruise : Math.sqrt((2 * d) / a) * 1.5;
    return { position: tgt.position, t: time, targetId };
  }

  const boostLeft = Math.max(0, g.fuel - g.reserve);
  let coastFirst = 0; // a cold torpedo coasts until it lights
  let dLeft = d;
  if (g.stage === "cold") {
    if (vc <= 0) return null;
    coastFirst = Math.max(0, d - TT.coldIgnitionDistance) / vc;
    dLeft = Math.min(d, TT.coldIgnitionDistance);
  }
  if (vc <= 0 && boostLeft <= 0) return null;
  const time = coastFirst + timeToGo(dLeft, Math.max(0, vc), a, boostLeft);
  return { position: add(tgt.position, scale(tgt.velocity, time)), t: time, targetId };
}

/**
 * Proximity fuse: a torpedo that passes within the fuse radius of a hostile ship during
 * this tick detonates. Never on friendlies. `shipsBefore` holds positions at the start
 * of the tick.
 */
export function fuseTorpedoes(world: World, torpedoesBefore: Map<string, Vec3>, shipsBefore: Map<string, Vec3>, events: SimEvent[]): void {
  for (const t of world.torpedoes) {
    if (t.destroyed || !t.guidance || t.guidance.stage === "cold") continue;
    const t0 = torpedoesBefore.get(t.id);
    if (!t0) continue;
    for (const s of world.ships) {
      if (s.destroyed || !areHostile(world, t.faction, s.faction)) continue;
      const s0 = shipsBefore.get(s.id) ?? s.position;
      if (closestApproach(t0, t.position, s0, s.position).dist > TT.fuseRadius) continue;
      // The hit comes from the direction the torpedo is coming from, relative to the ship.
      const rel = sub(t.velocity, s.velocity);
      const from = length(rel) > 1 ? scale(rel, -1) : sub(t.position, s.position);
      events.push({ type: "torpedoDetonated", torpedo: t.id, faction: t.faction, hit: s.id, position: { ...t.position } });
      destroy(world, t, "detonated");
      applyHit(world, s, from, C.torpedoHull, C.torpedoSubsystem, "torpedo", t.faction);
      break;
    }
  }
}
