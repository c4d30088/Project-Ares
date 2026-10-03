// Integration and attitude. SI units throughout.

import { gravityAt, type MassiveBody } from "./gravity";
import { clamp } from "./math";
import { dot, length, normalize, type Vec3 } from "./vec3";

/**
 * Advances position and velocity under constant acceleration for dt seconds.
 * Exact for constant acceleration within the step.
 */
export function integrate(position: Vec3, velocity: Vec3, accel: Vec3, dt: number): void {
  position.x += velocity.x * dt + 0.5 * accel.x * dt * dt;
  position.y += velocity.y * dt + 0.5 * accel.y * dt * dt;
  position.z += velocity.z * dt + 0.5 * accel.z * dt * dt;
  velocity.x += accel.x * dt;
  velocity.y += accel.y * dt;
  velocity.z += accel.z * dt;
}

/**
 * Advances position and velocity for dt under constant thrust plus gravity (velocity
 * Verlet: gravity sampled at the start and end of the step). With no bodies or gravity off
 * this is exactly the constant-acceleration step above. Orbits stay stable for hours.
 */
export function integrateWithGravity(
  position: Vec3,
  velocity: Vec3,
  thrust: Vec3,
  bodies: readonly MassiveBody[],
  dt: number,
): void {
  const g0 = gravityAt(bodies, position);
  const ax = thrust.x + g0.x, ay = thrust.y + g0.y, az = thrust.z + g0.z;
  position.x += velocity.x * dt + 0.5 * ax * dt * dt;
  position.y += velocity.y * dt + 0.5 * ay * dt * dt;
  position.z += velocity.z * dt + 0.5 * az * dt * dt;
  const g1 = gravityAt(bodies, position);
  velocity.x += (ax + thrust.x + g1.x) * 0.5 * dt;
  velocity.y += (ay + thrust.y + g1.y) * 0.5 * dt;
  velocity.z += (az + thrust.z + g1.z) * 0.5 * dt;
}

/** Angle between two unit vectors, radians. */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

/**
 * Turns unit vector `from` toward unit vector `to` by at most maxAngle radians, along the
 * shortest arc. Returns a new unit vector.
 */
export function slerpToward(from: Vec3, to: Vec3, maxAngle: number): Vec3 {
  const angle = angleBetween(from, to);
  if (angle <= maxAngle || angle < 1e-12) return normalize(to);
  // Axis perpendicular to `from` in the plane of from/to. For an exact 180° reversal any
  // perpendicular axis works; pick one deterministically.
  let perp = { x: to.x - from.x * dot(from, to), y: to.y - from.y * dot(from, to), z: to.z - from.z * dot(from, to) };
  if (length(perp) < 1e-9) {
    const helper = Math.abs(from.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    perp = { x: helper.x - from.x * dot(from, helper), y: helper.y - from.y * dot(from, helper), z: helper.z - from.z * dot(from, helper) };
  }
  const p = normalize(perp);
  const c = Math.cos(maxAngle), s = Math.sin(maxAngle);
  return normalize({ x: from.x * c + p.x * s, y: from.y * c + p.y * s, z: from.z * c + p.z * s });
}

