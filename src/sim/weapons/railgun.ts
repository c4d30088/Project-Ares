// Railguns and slugs (DESIGN.md section 7). A slug flies ballistically: gravity bends it
// near bodies, nothing steers it. Aiming at a ship fires at the lead point, where the
// target will be when the slug arrives if it keeps its present motion; a target that
// changes course in the meantime is missed. Slugs hit whatever ship they pass through,
// friend or foe.

import { combatTuning as C, loadouts } from "../../data/combat";
import { railgunTuning as RT } from "../../data/weapons";
import type { SimEvent } from "../commands";
import { closestApproach, segmentHitsSphere } from "../collide";
import { applyHit, destroy } from "../damage";
import { gravityAt, type MassiveBody } from "../gravity";
import { projectileFlightTime } from "../intercept";
import { angleBetween } from "../physics";
import { resolveTarget, type Target } from "../target";
import { add, clone, length, normalize, scale, sub, type Vec3 } from "../vec3";
import type { Ship, ShipClass, World } from "../world";

/** The class's railgun numbers, or null if it carries none. */
export function railgunSpec(cls: ShipClass) {
  const kind = loadouts[cls].railgun;
  return kind === "none" ? null : RT[kind];
}

export function initRailguns(cls: ShipClass): { railguns: { rechargeS: number }[]; slugs: number; slugsFired: number } {
  const spec = railgunSpec(cls);
  return { railguns: Array.from({ length: loadouts[cls].railguns }, () => ({ rechargeS: 0 })), slugs: spec ? spec.ammo : 0, slugsFired: 0 };
}

/** One ballistic step (velocity Verlet, as for everything else that falls). */
function fall(bodies: readonly MassiveBody[], p: Vec3, v: Vec3, dt: number): void {
  const g0 = gravityAt(bodies, p);
  p.x += v.x * dt + 0.5 * g0.x * dt * dt;
  p.y += v.y * dt + 0.5 * g0.y * dt * dt;
  p.z += v.z * dt + 0.5 * g0.z * dt * dt;
  const g1 = gravityAt(bodies, p);
  v.x += 0.5 * (g0.x + g1.x) * dt;
  v.y += 0.5 * (g0.y + g1.y) * dt;
  v.z += 0.5 * (g0.z + g1.z) * dt;
}

/**
 * A slug's predicted path from its shot: points every sampleS until maxS, or until it hits
 * a body (then `blocked`). Exact for a slug, since nothing acts on it but gravity.
 */
export function predictSlugPath(
  bodies: readonly MassiveBody[],
  origin: Vec3,
  velocity: Vec3,
  maxS: number,
  sampleS = RT.pathSampleS,
): { points: { t: number; position: Vec3 }[]; blocked: boolean } {
  const p = clone(origin);
  const v = clone(velocity);
  const points = [{ t: 0, position: clone(p) }];
  const step = Math.min(0.5, sampleS); // fine enough near bodies
  let t = 0;
  let next = sampleS;
  while (t < maxS) {
    const before = clone(p);
    fall(bodies, p, v, step);
    t += step;
    for (const b of bodies) {
      if (segmentHitsSphere(before, p, b.position, b.radius)) {
        points.push({ t, position: clone(p) });
        return { points, blocked: true };
      }
    }
    if (t >= next) {
      points.push({ t, position: clone(p) });
      next += sampleS;
    }
  }
  return { points, blocked: false };
}

/** Closest approach of a predicted path to a point moving in a straight line. */
export function pathClosest(points: { t: number; position: Vec3 }[], p0: Vec3, v: Vec3): { dist: number; t: number; position: Vec3 } {
  let best = { dist: Infinity, t: 0, position: points[0].position };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const ta = add(p0, scale(v, a.t)), tb = add(p0, scale(v, b.t));
    const c = closestApproach(a.position, b.position, ta, tb);
    if (c.dist < best.dist) {
      const t = a.t + (b.t - a.t) * c.t;
      best = { dist: c.dist, t, position: add(a.position, scale(sub(b.position, a.position), c.t)) };
    }
  }
  return best;
}

/** Closest approach of two predicted paths sampled on the same times. */
function pathsClosest(a: { t: number; position: Vec3 }[], b: { t: number; position: Vec3 }[]): { dist: number; t: number; position: Vec3; other: Vec3 } {
  let best = { dist: Infinity, t: 0, position: a[0].position, other: b[0].position };
  for (let i = 1; i < Math.min(a.length, b.length); i++) {
    const c = closestApproach(a[i - 1].position, a[i].position, b[i - 1].position, b[i].position);
    if (c.dist < best.dist) {
      best = {
        dist: c.dist,
        t: a[i - 1].t + (a[i].t - a[i - 1].t) * c.t,
        position: add(a[i - 1].position, scale(sub(a[i].position, a[i - 1].position), c.t)),
        other: add(b[i - 1].position, scale(sub(b[i].position, b[i - 1].position), c.t)),
      };
    }
  }
  return best;
}

/**
 * Where to point the railgun to hit a target. A slug leaves with the ship's velocity plus
 * the gun's muzzle velocity, so the aim is worked out in the ship's own frame: the target's
 * motion relative to the ship says which way the muzzle velocity must point, and the ship's
 * drift is cancelled by that (not by aiming at the lead point in space, which would throw
 * the shot sideways whenever the ship is moving). A ship target is led assuming it keeps
 * coasting (falling under gravity like everything else); a point or a body is aimed at
 * directly. The result is corrected for the slug's own fall past bodies. Returns the slug's
 * launch velocity, the predicted time to the target and the predicted meeting point; null
 * if the target is getting away faster than the slug can close.
 */
export function aimRailgun(world: World, ship: Ship, target: Target): { velocity: Vec3; t: number; aimPoint: Vec3 } | null {
  const spec = railgunSpec(ship.shipClass);
  const tgt = resolveTarget(world, target);
  if (!spec || !tgt) return null;
  const speed = spec.slugSpeed;
  const moving = target.kind === "track";
  const tv = moving ? tgt.velocity : { x: 0, y: 0, z: 0 };
  // In the ship's frame: where the target is and how it moves.
  const r = sub(tgt.position, ship.position);
  const rel = sub(tv, ship.velocity);
  const tof0 = projectileFlightTime(r, rel, speed);
  if (tof0 === null) return null;
  const launch = (relativeAim: Vec3) => add(ship.velocity, scale(normalize(relativeAim), speed));

  let tof = Math.max(tof0, 0.02);
  let velocity = launch(add(r, scale(rel, tof)));
  let best = { velocity, t: tof, meet: add(tgt.position, scale(tv, tof)), miss: Infinity };
  // Fly the shot (and, for a ship, the target's coast) and turn the muzzle velocity by the
  // miss spread over the flight, keeping its length.
  for (let i = 0; i < 8; i++) {
    const horizon = tof * 1.3 + 5;
    const dt = Math.max(0.02, tof / 300);
    const shot = predictSlugPath(world.bodies, ship.position, velocity, horizon, dt).points;
    const them = moving ? predictSlugPath(world.bodies, tgt.position, tv, horizon, dt).points : shot.map((p) => ({ t: p.t, position: tgt.position }));
    const c = pathsClosest(shot, them);
    const miss = sub(c.other, c.position);
    if (length(miss) < best.miss) best = { velocity, t: c.t, meet: c.other, miss: length(miss) };
    if (length(miss) < 1) break;
    tof = Math.max(c.t, 0.02);
    velocity = launch(add(sub(velocity, ship.velocity), scale(miss, 1 / tof)));
  }
  return { velocity: best.velocity, t: best.t, aimPoint: best.meet };
}

/** Why a railgun shot cannot be made now (null if it can), for the command and the HUD. */
export function railgunBlocked(world: World, ship: Ship, target: Target): string | null {
  const spec = railgunSpec(ship.shipClass);
  if (!spec || !ship.weapons.railguns.length) return "no railgun";
  if ((ship.health.railgun ?? 0) <= 0) return "railgun destroyed";
  if (ship.weapons.slugs <= 0) return "out of slugs";
  if (!ship.weapons.railguns.some((g) => g.rechargeS <= 0)) {
    const s = Math.ceil(Math.min(...ship.weapons.railguns.map((g) => g.rechargeS)));
    return `recharging ${s} s`;
  }
  const aim = aimRailgun(world, ship, target);
  if (!aim) return "no firing solution";
  const dir = normalize(sub(aim.velocity, ship.velocity));
  if (angleBetween(ship.heading, dir) > (spec.arcDeg * Math.PI) / 180) return spec.arcDeg <= 5 ? "turn the ship to aim" : "out of arc";
  return null;
}

/** Fires one slug at the target. Returns a reason if it cannot. */
export function fireRailgun(world: World, ship: Ship, target: Target, events: SimEvent[]): string | null {
  const why = railgunBlocked(world, ship, target);
  if (why) return why;
  const spec = railgunSpec(ship.shipClass)!;
  const aim = aimRailgun(world, ship, target)!;
  const gun = ship.weapons.railguns.find((g) => g.rechargeS <= 0)!;
  gun.rechargeS = spec.rechargeS / Math.max(0.25, ship.health.railgun ?? 1);
  ship.weapons.slugs--;
  ship.weapons.slugsFired++;
  const id = `${ship.id}-S${String(ship.weapons.slugsFired).padStart(2, "0")}`;
  world.slugs.push({
    id,
    faction: ship.faction,
    launcher: ship.id,
    position: clone(ship.position),
    velocity: clone(aim.velocity),
    ageS: 0,
    damageScale: spec.damageScale,
    shot: { tick: world.tick, origin: clone(ship.position), velocity: clone(aim.velocity) },
    aim: { point: clone(aim.aimPoint), t: aim.t },
  });
  events.push({ type: "railgunFired", ship: ship.id, faction: ship.faction, slug: id });
  return null;
}

/** Counts railgun recharge down. */
export function rechargeRailguns(world: World, dt: number): void {
  for (const ship of world.ships) for (const g of ship.weapons.railguns) if (g.rechargeS > 0) g.rechargeS = Math.max(0, g.rechargeS - dt);
}

/**
 * Moves slugs one tick and checks hits along the way: any ship whose hull the slug passes
 * through (its own ship only after the muzzle-safe time), or a body. `shipsBefore` holds
 * ship positions at the start of the tick.
 */
export function moveSlugs(world: World, dt: number, shipsBefore: Map<string, Vec3>, events: SimEvent[]): void {
  for (const s of world.slugs) {
    if (s.destroyed) continue;
    const before = clone(s.position);
    fall(world.bodies, s.position, s.velocity, dt);
    s.ageS += dt;
    for (const ship of world.ships) {
      if (ship.destroyed || (ship.id === s.launcher && s.ageS < RT.muzzleSafeS)) continue;
      const s0 = shipsBefore.get(ship.id) ?? ship.position;
      if (closestApproach(before, s.position, s0, ship.position).dist > C.hitRadius[ship.shipClass]) continue;
      const from = scale(sub(s.velocity, ship.velocity), -1);
      events.push({ type: "slugHit", slug: s.id, faction: s.faction, hit: ship.id, position: { ...s.position } });
      destroy(world, s, "hit");
      applyHit(world, ship, from, C.slugHull * s.damageScale, Math.min(1, C.slugSubsystem * s.damageScale), "railgun", s.faction);
      break;
    }
    if (s.destroyed) continue;
    for (const b of world.bodies) {
      if (segmentHitsSphere(before, s.position, b.position, b.radius)) {
        destroy(world, s, `impact on ${b.name}`);
        break;
      }
    }
    if (!s.destroyed && s.ageS > RT.slugMaxLifeS) destroy(world, s, "expired");
  }
  if (world.slugs.some((s) => s.destroyed)) world.slugs = world.slugs.filter((s) => !s.destroyed);
}
