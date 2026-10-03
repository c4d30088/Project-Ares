// Conversion from sim coordinates to three.js coordinates.
// Sim: meters, X/Y span the reference plane, Z up, float64.
// three.js: Y up. Positions are made relative to the camera focus first
// (floating origin, CLAUDE.md rule 9) so float32 GPU buffers never see huge values.

import type { Vector3 } from "three";
import type { Vec3 } from "../sim/vec3";

/** Writes (simPos - focus) into `out` in three.js axes. */
export function toRender(simPos: Vec3, focus: Vec3, out: Vector3): Vector3 {
  return out.set(simPos.x - focus.x, simPos.z - focus.z, -(simPos.y - focus.y));
}

/** Converts a three.js direction (no origin shift) to sim axes. */
export function dirToSim(x: number, y: number, z: number): Vec3 {
  return { x, y: -z, z: y };
}

/** Inverse of toRender: a three.js position (relative to focus) back to sim coordinates. */
export function fromRender(x: number, y: number, z: number, focus: Vec3): Vec3 {
  return { x: x + focus.x, y: -z + focus.y, z: y + focus.z };
}
