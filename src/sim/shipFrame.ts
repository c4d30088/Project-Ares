// A ship's body frame: forward along the bow, up toward the table's +Z (as close as the bow
// allows), left completing a right-handed set. Ships have no separate roll yet.

import { cross, dot, length, normalize, scale, sub, type Vec3 } from "./vec3";

export interface Frame {
  forward: Vec3;
  left: Vec3;
  up: Vec3;
}

export function shipFrame(heading: Vec3): Frame {
  const forward = normalize(heading);
  let ref = { x: 0, y: 0, z: 1 };
  if (Math.abs(dot(forward, ref)) > 0.99) ref = { x: 0, y: 1, z: 0 };
  const up = normalize(sub(ref, scale(forward, dot(ref, forward))));
  const left = cross(up, forward);
  return { forward, left: length(left) > 0 ? left : { x: 0, y: 1, z: 0 }, up };
}

/** World direction -> body frame components. */
export function toLocal(f: Frame, v: Vec3): { f: number; l: number; u: number } {
  return { f: dot(v, f.forward), l: dot(v, f.left), u: dot(v, f.up) };
}

/** Body frame components -> world direction. */
export function toWorld(f: Frame, local: { f: number; l: number; u: number }): Vec3 {
  return {
    x: f.forward.x * local.f + f.left.x * local.l + f.up.x * local.u,
    y: f.forward.y * local.f + f.left.y * local.l + f.up.y * local.u,
    z: f.forward.z * local.f + f.left.z * local.l + f.up.z * local.u,
  };
}

/**
 * PDC mount directions in the body frame: spread around the hull, alternately tilted
 * forward and aft so their arcs overlap.
 */
export function pdcMountDirections(count: number): { f: number; l: number; u: number }[] {
  const out: { f: number; l: number; u: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count + Math.PI / count;
    const tilt = i % 2 === 0 ? 0.35 : -0.35;
    const v = { f: tilt, l: Math.cos(a), u: Math.sin(a) };
    const n = Math.hypot(v.f, v.l, v.u);
    out.push({ f: v.f / n, l: v.l / n, u: v.u / n });
  }
  return out;
}
