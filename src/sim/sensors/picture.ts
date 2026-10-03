// The sensor picture: everything one faction knows. The renderer and HUD read only this,
// never the World directly (CLAUDE.md rule 6).
//
// Until real sensors arrive in M4, buildPerfectPicture() reports ground truth.
// The shape of the picture is already the final one, so the renderer will not change.

import { clone, type Vec3 } from "../vec3";
import { areHostile, type BodyKind, type FactionId, type ShipClass, type World } from "../world";

export type Allegiance = "friendly" | "neutral" | "hostile" | "unknown";
export type TrackKind = "ship" | "torpedo" | "station";

export interface Track {
  id: string;
  kind: TrackKind;
  allegiance: Allegiance;
  /** Ship class if identified. Torpedoes and stations: undefined. */
  shipClass?: ShipClass;
  /** False when the contact is not yet identified (unknown contact symbol). */
  identified: boolean;
  label: string;
  position: Vec3;
  velocity: Vec3;
  /** Bow direction, when known. */
  heading: Vec3;
  /** True if a drive plume is seen. */
  burning: boolean;
  /** Ids of own ships whose sensors currently contribute to this track (rule 11). */
  contributors: string[];
  lastUpdateTick: number;
}

export interface OwnShip {
  id: string;
  name: string;
  shipClass: ShipClass;
  position: Vec3;
  velocity: Vec3;
  heading: Vec3;
  thrust: number;
}

/** Charted objects: bodies are known from navigation charts, not detected. */
export interface ChartedBody {
  id: string;
  name: string;
  kind: BodyKind;
  position: Vec3;
  radius: number;
}

export interface SensorPicture {
  faction: FactionId;
  tick: number;
  ownShips: OwnShip[];
  tracks: Track[];
  bodies: ChartedBody[];
}

export function buildPerfectPicture(world: World, faction: FactionId): SensorPicture {
  const own = world.ships.filter((s) => s.faction === faction);
  const contributors = own.map((s) => s.id);
  const allegianceOf = (f: FactionId): Allegiance =>
    f === faction ? "friendly" : areHostile(world, faction, f) ? "hostile" : "neutral";

  const tracks: Track[] = [];

  for (const s of world.ships) {
    if (s.faction === faction) continue;
    const identified = !s.testShowAsUnknown;
    tracks.push({
      id: s.id,
      kind: "ship",
      allegiance: identified ? allegianceOf(s.faction) : "unknown",
      shipClass: identified ? s.shipClass : undefined,
      identified,
      label: identified ? s.name : "UNKNOWN",
      position: clone(s.position),
      velocity: clone(s.velocity),
      heading: clone(s.heading),
      burning: s.thrust > 0,
      contributors: [...contributors],
      lastUpdateTick: world.tick,
    });
  }

  for (const t of world.torpedoes) {
    tracks.push({
      id: t.id,
      kind: "torpedo",
      allegiance: allegianceOf(t.faction),
      identified: true,
      label: t.id,
      position: clone(t.position),
      velocity: clone(t.velocity),
      heading: clone(t.heading),
      burning: t.thrust > 0,
      contributors: t.faction === faction ? [] : [...contributors],
      lastUpdateTick: world.tick,
    });
  }

  for (const st of world.stations) {
    tracks.push({
      id: st.id,
      kind: "station",
      allegiance: allegianceOf(st.faction),
      identified: true,
      label: st.name,
      position: clone(st.position),
      velocity: clone(st.velocity),
      heading: { x: 1, y: 0, z: 0 },
      burning: false,
      contributors: st.faction === faction ? [] : [...contributors],
      lastUpdateTick: world.tick,
    });
  }

  return {
    faction,
    tick: world.tick,
    ownShips: own.map((s) => ({
      id: s.id,
      name: s.name,
      shipClass: s.shipClass,
      position: clone(s.position),
      velocity: clone(s.velocity),
      heading: clone(s.heading),
      thrust: s.thrust,
    })),
    tracks,
    bodies: world.bodies.map((b) => ({ ...b, position: clone(b.position) })),
  };
}
