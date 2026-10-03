// Hit detection between ticks. Fast things (slugs at 20 km/s move 1 km per tick) are
// checked along their path during the tick, not just at its end.

import { add, dot, length, scale, sub, type Vec3 } from "./vec3";

/**
 * Closest approach of two points moving in straight lines from a0->a1 and b0->b1 over one
 * tick. Returns the distance and the fraction of the tick (0..1) when it happens.
 */
export function closestApproach(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3): { dist: number; t: number } {
  const r0 = sub(b0, a0);
  const dr = sub(sub(b1, a1), r0); // change in relative position over the tick
  const len2 = dot(dr, dr);
  const t = len2 > 0 ? Math.max(0, Math.min(1, -dot(r0, dr) / len2)) : 0;
  return { dist: length(add(r0, scale(dr, t))), t };
}

/** True if the segment p0->p1 passes within r of c. */
export function segmentHitsSphere(p0: Vec3, p1: Vec3, c: Vec3, r: number): boolean {
  const d = sub(p1, p0);
  const len2 = dot(d, d);
  const t = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(c, p0), d) / len2)) : 0;
  return length(sub(add(p0, scale(d, t)), c)) < r;
}
