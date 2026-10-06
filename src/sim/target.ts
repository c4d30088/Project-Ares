// A Target is one of: a track, an object, or a point in space (CLAUDE.md rule 10).
// Nav orders and, from M3, every weapon take a Target.

import { clone, scale, type Vec3 } from "./vec3";
import { contactOf, estimatePosition } from "./sensors/tracks";
import type { FactionId, World } from "./world";

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
 * Where a target is and how it moves. A track id is the id of the entity it follows.
 *
 * Given a faction (M4 Sensors Lite), the answer is what that side knows: a contact it sees
 * now is exact (seen means known); a lost one is where its last-seen course says it would
 * be now, coasting; one it has never seen, or has forgotten, is unknown (null). Its own
 * side's ships and torpedoes, stations and charted bodies are always known. Without a
 * faction, or in a perfect-information world, the answer is ground truth.
 */
export function resolveTarget(world: World, target: Target, faction?: FactionId): ResolvedTarget | null {
  if (target.kind === "point") return { position: clone(target.position), velocity: { ...ZERO }, thrust: { ...ZERO } };
  const id = target.id;
  if (faction && !world.perfectInfo && target.kind === "track") {
    const own = world.ships.find((s) => s.id === id) ?? world.torpedoes.find((t) => t.id === id);
    if (!own || own.faction !== faction) {
      const rec = contactOf(world, faction, id);
      if (!rec) return world.stations.some((s) => s.id === id) ? resolveTarget(world, target) : null;
      if (!rec.seenBy.length || !own) return { position: estimatePosition(world, rec), velocity: clone(rec.velocity), thrust: { ...ZERO } };
    }
  }
  const driven = world.ships.find((s) => s.id === id) ?? world.torpedoes.find((t) => t.id === id);
  if (driven) return { position: clone(driven.position), velocity: clone(driven.velocity), thrust: scale(driven.heading, driven.thrust) };
  const station = world.stations.find((s) => s.id === id);
  if (station) return { position: clone(station.position), velocity: clone(station.velocity), thrust: { ...ZERO } };
  const body = world.bodies.find((b) => b.id === id);
  if (body) return { position: clone(body.position), velocity: { ...ZERO }, thrust: { ...ZERO } };
  return null;
}
