// A Target is one of: a track, an object, or a point in space (CLAUDE.md rule 10).
// Nav orders and, from M3, every weapon take a Target.

import { clone, scale, type Vec3 } from "./vec3";
import type { World } from "./world";

export type Target =
  | { kind: "track"; id: string }
  | { kind: "object"; id: string }
  | { kind: "point"; position: Vec3 };

export interface ResolvedTarget {
  position: Vec3;
  velocity: Vec3;
  /** Acceleration from its own drive (gravity not included), m/s². */
  thrust: Vec3;
}

const ZERO = { x: 0, y: 0, z: 0 };

/**
 * Where a target is and how it moves. Until sensors exist (M4), a track id is the id of
 * the entity it follows; from M4 the sim maps a faction's track ids to its own estimates.
 */
export function resolveTarget(world: World, target: Target): ResolvedTarget | null {
  if (target.kind === "point") return { position: clone(target.position), velocity: { ...ZERO }, thrust: { ...ZERO } };
  const id = target.id;
  const driven = world.ships.find((s) => s.id === id) ?? world.torpedoes.find((t) => t.id === id);
  if (driven) return { position: clone(driven.position), velocity: clone(driven.velocity), thrust: scale(driven.heading, driven.thrust) };
  const station = world.stations.find((s) => s.id === id);
  if (station) return { position: clone(station.position), velocity: clone(station.velocity), thrust: { ...ZERO } };
  const body = world.bodies.find((b) => b.id === id);
  if (body) return { position: clone(body.position), velocity: { ...ZERO }, thrust: { ...ZERO } };
  return null;
}
