// Gravity from celestial bodies. Bodies stay on fixed positions during a battle
// (DESIGN.md section 6); everything that moves is pulled by all of them.

import { physicsTuning as P } from "../data/physics";
import type { Vec3 } from "./vec3";
import type { BodyKind } from "./world";

export const G_CONST = 6.674e-11; // m³ kg⁻¹ s⁻²

export interface MassiveBody {
  position: Vec3;
  radius: number;
  kind: BodyKind;
  /** Standard gravitational parameter G·M (m³/s²). If absent, from size and density. */
  gm?: number;
}

/** G·M of a body, m³/s². */
export function bodyMu(b: MassiveBody): number {
  if (b.gm !== undefined) return b.gm;
  return G_CONST * (4 / 3) * Math.PI * b.radius ** 3 * P.density[b.kind];
}

/**
 * Gravitational acceleration at p, m/s². Inside a body the pull falls off linearly to zero
 * at the center, so nothing blows up if something ends up there.
 */
export function gravityAt(bodies: readonly MassiveBody[], p: Vec3): Vec3 {
  const g = { x: 0, y: 0, z: 0 };
  if (!P.gravityEnabled) return g;
  for (const b of bodies) {
    const dx = b.position.x - p.x, dy = b.position.y - p.y, dz = b.position.z - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const d = Math.sqrt(d2);
    if (d < 1e-6) continue;
    const mu = bodyMu(b);
    const k = d >= b.radius ? mu / (d2 * d) : mu / (b.radius * b.radius * b.radius);
    g.x += dx * k;
    g.y += dy * k;
    g.z += dz * k;
  }
  return g;
}
