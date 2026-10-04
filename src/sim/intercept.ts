// Intercept of a projectile that leaves its shooter at a fixed speed. Everything is worked
// in the shooter's own frame: a projectile carries the shooter's velocity plus its muzzle
// velocity, so only the target's motion relative to the shooter matters.

import type { Vec3 } from "./vec3";

/**
 * Time for a projectile of `speed` (relative to the shooter) to meet a target at relative
 * position `r` moving at relative velocity `rel`: the smallest positive t with
 * |r + rel t| = speed t. Null if the target is getting away faster than the projectile.
 */
export function projectileFlightTime(r: Vec3, rel: Vec3, speed: number): number | null {
  const a = rel.x * rel.x + rel.y * rel.y + rel.z * rel.z - speed * speed;
  const b = 2 * (r.x * rel.x + r.y * rel.y + r.z * rel.z);
  const c = r.x * r.x + r.y * r.y + r.z * r.z;
  if (c < 1e-9) return 0;
  if (Math.abs(a) < 1e-9) return b < 0 ? -c / b : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const times = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((t) => t > 0);
  return times.length ? Math.min(...times) : null;
}

/**
 * Launch velocity (absolute: shooter velocity plus muzzle velocity) and flight time for a
 * projectile to hit a target that keeps its present velocity. Null if it cannot be caught.
 */
export function leadShot(from: Vec3, fromVelocity: Vec3, to: Vec3, toVelocity: Vec3, speed: number): { velocity: Vec3; t: number } | null {
  const r = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const rel = { x: toVelocity.x - fromVelocity.x, y: toVelocity.y - fromVelocity.y, z: toVelocity.z - fromVelocity.z };
  const t = projectileFlightTime(r, rel, speed);
  if (t === null) return null;
  // Where the target is in the shooter's frame when the projectile arrives.
  const ax = r.x + rel.x * t, ay = r.y + rel.y * t, az = r.z + rel.z * t;
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-9) return { velocity: { ...fromVelocity }, t };
  return { velocity: { x: fromVelocity.x + (ax / len) * speed, y: fromVelocity.y + (ay / len) * speed, z: fromVelocity.z + (az / len) * speed }, t };
}
