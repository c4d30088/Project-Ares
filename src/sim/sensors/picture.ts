// The sensor picture: everything one faction knows. The renderer and HUD read only this,
// never the World directly (CLAUDE.md rule 6).
//
// Until real sensors arrive in M4, buildPerfectPicture() reports ground truth.
// The shape of the picture is already the final one, so the renderer will not change.

import { clone, type Vec3 } from "../vec3";
import { bodyMu } from "../gravity";
import { predictImpact } from "../weapons/torpedo";
import { mountDirection, pdcAims } from "../weapons/pdc";
import { railgunSpec } from "../weapons/railgun";
import { crewEfficiency } from "../crew";
import { pdcTuning } from "../../data/weapons";
import { loadouts } from "../../data/combat";
import type { NavOrder, NavPhase } from "../commands";
import { areHostile, type BodyKind, type FactionId, type GSetting, type ShipClass, type World } from "../world";

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
  /** Torpedoes: predicted impact (seconds from now) and what it is aimed at, if known. */
  impact?: { position: Vec3; t: number; targetId: string | null };
  /** Ships: where its PDCs are firing this tick (PDC fire is visible). */
  pdcFire?: Vec3[];
}

/**
 * A railgun shot. A slug cannot be tracked in flight, so the picture holds the shot (seen
 * when it was fired: where from, and how fast which way); its path is predicted from that.
 * Our own shots also carry where the slug is now and what it was aimed at.
 */
export interface RailShot {
  id: string;
  allegiance: Allegiance;
  /** Tick it was fired, and the slug's state as it left the gun. */
  tick: number;
  origin: Vec3;
  velocity: Vec3;
  /** Ours only. */
  position?: Vec3;
  aim?: { point: Vec3; t: number };
}

export interface OwnRailgun {
  /** Seconds until a gun is ready (0 = ready now). */
  rechargeS: number;
  slugs: number;
  slugsMax: number;
  health: number;
  spinal: boolean;
}

export interface OwnPdc {
  mode: "auto" | "manual" | "hold";
  firing: boolean;
  /** Where it is firing, if it is, and at what (null for a barrage at a point). */
  aimAt: Vec3 | null;
  aimId: string | null;
  /** Mount direction in world space (center of its arc). */
  direction: Vec3;
  /** Rounds left (whole) and a full magazine. */
  rounds: number;
  roundsMax: number;
  health: number;
}

export interface OwnShip {
  id: string;
  name: string;
  shipClass: ShipClass;
  position: Vec3;
  velocity: Vec3;
  heading: Vec3;
  thrust: number;
  g: GSetting;
  /** Current nav order type, or null when coasting. */
  orderType: NavOrder["type"] | null;
  phase: NavPhase;
  /** Subsystem health, 1 = intact. */
  health: Record<string, number>;
  /** G-strain 0..1, and crew efficiency (1 = fresh and whole). */
  strain: number;
  efficiency: number;
  /** Torpedoes left (magazine), ordered but not yet fired, and tubes ready to fire. */
  torpedoes: { magazine: number; queued: number; tubes: number; tubesReady: number };
  pdcs: OwnPdc[];
  /** Half-angle of each PDC mount's arc, radians. */
  pdcArc: number;
  pdcBurst: { enabled: boolean; rounds: number; intervalS: number };
  /** Null if the class carries no railgun. */
  railgun: OwnRailgun | null;
  /** The orbit the ship is flying to or in. */
  orbit?: { bodyId: string; center: Vec3; radius: number; normal: Vec3; established: boolean; period: number; bodyRadius: number };
}

/** Charted objects: bodies are known from navigation charts, not detected. */
export interface ChartedBody {
  id: string;
  name: string;
  kind: BodyKind;
  position: Vec3;
  radius: number;
  /** G·M in m³/s² (charted, so known to everyone). */
  gm: number;
}

export interface SensorPicture {
  faction: FactionId;
  tick: number;
  ownShips: OwnShip[];
  tracks: Track[];
  shots: RailShot[];
  bodies: ChartedBody[];
}

function orbitInfo(world: World, s: World["ships"][number]): OwnShip["orbit"] {
  const o = s.order;
  if (!o || o.type !== "orbit" || o.target.kind === "point") return undefined;
  const id = o.target.id;
  const body = world.bodies.find((b) => b.id === id);
  if (!body) return undefined;
  return {
    bodyId: body.id,
    center: clone(body.position),
    radius: o.radius,
    normal: clone(o.normal),
    established: s.nav.orbitStage === "orbit",
    period: 2 * Math.PI * Math.sqrt(o.radius ** 3 / bodyMu(body)),
    bodyRadius: body.radius,
  };
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
      pdcFire: pdcAims(world, s).flatMap((p) => (p ? [p] : [])),
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
      impact: predictImpact(world, t) ?? undefined,
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
      g: s.g,
      orderType: s.order?.type ?? null,
      phase: s.nav.phase,
      orbit: orbitInfo(world, s),
      health: { ...s.health },
      strain: s.strain,
      efficiency: crewEfficiency(s),
      torpedoes: {
        magazine: s.weapons.magazine,
        queued: s.weapons.launchQueue.length,
        tubes: s.weapons.tubeReload.length,
        tubesReady: s.weapons.tubeReload.filter((r) => r <= 0).length,
      },
      pdcs: s.weapons.pdcs.map((m, i) => ({
        mode: m.mode,
        firing: m.firing,
        aimAt: pdcAims(world, s)[i],
        aimId: m.firing && m.engaged !== "point" ? m.engaged : null,
        direction: mountDirection(s, i),
        rounds: Math.floor(m.rounds),
        roundsMax: pdcTuning.roundsPerMount,
        health: s.health[`pdc${i + 1}`] ?? 0,
      })),
      pdcArc: (loadouts[s.shipClass].pdcArcDeg * Math.PI) / 180,
      pdcBurst: { ...s.weapons.pdcBurst },
      railgun: s.weapons.railguns.length
        ? {
            rechargeS: Math.min(...s.weapons.railguns.map((g) => g.rechargeS)),
            slugs: s.weapons.slugs,
            slugsMax: railgunSpec(s.shipClass)!.ammo,
            health: s.health.railgun ?? 0,
            spinal: loadouts[s.shipClass].railgun === "spinal",
          }
        : null,
    })),
    tracks,
    shots: world.slugs.map((sl) => {
      const own = sl.faction === faction;
      return {
        id: sl.id,
        allegiance: allegianceOf(sl.faction),
        tick: sl.shot.tick,
        origin: clone(sl.shot.origin),
        velocity: clone(sl.shot.velocity),
        ...(own ? { position: clone(sl.position), aim: { point: clone(sl.aim.point), t: sl.aim.t } } : {}),
      };
    }),
    bodies: world.bodies.map((b) => ({ ...b, position: clone(b.position), gm: bodyMu(b) })),
  };
}
