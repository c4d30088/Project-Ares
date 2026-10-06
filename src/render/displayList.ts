// Turns the player's sensor picture into a flat list of symbols to draw.
// Pure function: no three.js, so it can be unit tested.

import type { Allegiance, SensorPicture } from "../sim/sensors/picture";
import type { Prediction } from "../sim/predict";
import type { TorpedoPath } from "../sim/weapons/torpedoPredict";
import { formatCountdown, formatSpeed } from "../ui/format";
import type { BodyKind } from "../sim/world";
import { length, type Vec3 } from "../sim/vec3";

export type SymbolShape =
  | "corvette" | "frigate" | "destroyer" | "cruiser" | "capital"
  | "station" | "unknown" | "torpedo";

export interface ShipSymbol {
  id: string;
  shape: SymbolShape;
  allegiance: Allegiance;
  /** Filled = drive burning, hollow = coasting (DESIGN.md section 12). */
  filled: boolean;
  /** Stations do not rotate. */
  rotates: boolean;
  position: Vec3;
  /** Direction the icon points: thrust when burning, velocity when coasting. */
  pointing: Vec3;
  label: string | null;
  isOwn: boolean;
  /** A lost contact: frozen where last seen, drawn orange and hollow, fading out (0..1). */
  lost?: boolean;
  fade?: number;
}

export interface BodySymbol {
  id: string;
  kind: BodyKind;
  name: string;
  position: Vec3;
  radius: number;
}

/** Screen-space markers on predicted paths. */
export interface PathMarker {
  id: string;
  /** range: a label only (for a weapon range ring). */
  kind: "flip" | "arrival" | "impact" | "range";
  position: Vec3;
  label: string;
  allegiance: Allegiance;
}

/** A point being placed for an order: crosshair, drop line and label. */
export interface Waypoint {
  id: string;
  position: Vec3;
  label: string;
  /** Shown in the warning color (amber). */
  warn?: boolean;
}

export interface DisplayList {
  symbols: ShipSymbol[];
  bodies: BodySymbol[];
  markers: PathMarker[];
  waypoints: Waypoint[];
}

/** Flip marker and arrival ring for each prediction, with countdowns from `now`. */
export function pathMarkers(predictions: Iterable<Prediction>, simTick: number, dt: number): PathMarker[] {
  const out: PathMarker[] = [];
  for (const p of predictions) {
    const elapsed = (simTick - p.startTick) * dt;
    if (p.flip && p.flip.t > elapsed) {
      out.push({
        id: `${p.shipId}:flip`,
        kind: "flip",
        position: p.flip.position,
        label: `FLIP T-${formatCountdown(p.flip.t - elapsed)}`,
        allegiance: "friendly",
      });
    }
    if (p.arrival) {
      out.push({
        id: `${p.shipId}:arrival`,
        kind: "arrival",
        position: p.arrival.position,
        label: `ETA ${formatCountdown(Math.max(0, p.arrival.t - elapsed))} · ${formatSpeed(p.arrival.speed)}${p.arrival.relative ? " REL" : ""}`,
        allegiance: "friendly",
      });
    }
  }
  return out;
}

/** A torpedo's predicted path, from where it is now to its impact (or its point). */
export interface InterceptLine {
  points: Vec3[];
  hostile: boolean;
  /** Our torpedo has lost sight of its target: drawn in the uncertain color. */
  blind?: boolean;
}

/**
 * Intercept lines and impact X marks for torpedoes in flight (DESIGN.md section 7): the
 * path each torpedo will fly, bends and all (from its ghost run, or a straight line until
 * that is ready), and one X per target at the soonest impact, with a countdown and how
 * many torpedoes are inbound to it.
 */
export function torpedoOverlays(
  picture: SensorPicture,
  paths: ReadonlyMap<string, TorpedoPath> = new Map(),
  simTick = 0,
  dt = 0,
): { lines: InterceptLine[]; markers: PathMarker[] } {
  const lines: InterceptLine[] = [];
  const groups = new Map<string, { position: Vec3; t: number; count: number; allegiance: Allegiance }>();
  for (const tr of picture.tracks) {
    // A lost torpedo has only its course line: where it flies now is not known.
    if (tr.kind !== "torpedo" || tr.lost) continue;
    const hostile = tr.allegiance === "hostile";
    const path = paths.get(tr.id);
    if (path) {
      const elapsed = (simTick - path.startTick) * dt;
      lines.push({ points: [tr.position, ...path.points.filter((p) => p.t > elapsed).map((p) => p.position)], hostile, blind: tr.blind });
    } else if (tr.impact) {
      lines.push({ points: [tr.position, tr.impact.position], hostile, blind: tr.blind });
    }
    if (!tr.impact) continue;
    // One X per target (per point for point-targeted torpedoes), per side.
    const key = `${tr.allegiance}:${tr.impact.targetId ?? tr.id}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { position: tr.impact.position, t: tr.impact.t, count: 1, allegiance: tr.allegiance });
    else {
      g.count++;
      if (tr.impact.t < g.t) {
        g.t = tr.impact.t;
        g.position = tr.impact.position;
      }
    }
  }
  const markers: PathMarker[] = [];
  for (const [key, g] of groups) {
    markers.push({
      id: `impact:${key}`,
      kind: "impact",
      position: g.position,
      label: `T-${formatCountdown(g.t)}${g.count > 1 ? ` \u00d7${g.count}` : ""}`,
      allegiance: g.allegiance,
    });
  }
  return { lines, markers };
}

/** Railgun shot paths seen on the table, by shot id (predicted from the shot). */
export interface ShotPathView {
  points: { t: number; position: Vec3 }[];
  danger: { position: Vec3; t: number } | null;
}

/** Where a predicted path is at time t (linear between samples). */
function along(points: { t: number; position: Vec3 }[], t: number): Vec3 {
  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= t) {
      const a = points[i - 1], b = points[i];
      const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
      return { x: a.position.x + (b.position.x - a.position.x) * f, y: a.position.y + (b.position.y - a.position.y) * f, z: a.position.z + (b.position.z - a.position.z) * f };
    }
  }
  return points[points.length - 1].position;
}

/**
 * Railgun shots on the table. A slug cannot be tracked, so each shot is drawn as its
 * predicted path from where the slug should be now. Ours: up to what it was aimed at, with
 * an X and countdown there, and a streak where the slug is. The enemy's: ahead for a
 * minute, or up to where it passes close to one of our ships, marked with an X and the
 * estimated time of impact.
 */
export function railShotOverlays(
  picture: SensorPicture,
  paths: ReadonlyMap<string, ShotPathView>,
  simTick: number,
  dt: number,
): { lines: InterceptLine[]; streaks: InterceptLine[]; markers: PathMarker[] } {
  const lines: InterceptLine[] = [];
  const streaks: InterceptLine[] = [];
  const markers: PathMarker[] = [];
  for (const shot of picture.shots) {
    const path = paths.get(shot.id);
    if (!path || path.points.length < 2) continue;
    const hostile = shot.allegiance === "hostile";
    const elapsed = (simTick - shot.tick) * dt;
    const now = shot.position ?? along(path.points, elapsed);
    let end: number;
    let mark: { position: Vec3; t: number } | null = null;
    if (shot.aim) {
      end = shot.aim.t + 3;
      if (shot.aim.t > elapsed) mark = { position: shot.aim.point, t: shot.aim.t - elapsed };
    } else if (path.danger) {
      end = elapsed + path.danger.t + 3;
      mark = path.danger;
    } else {
      end = elapsed + 60;
    }
    lines.push({ points: [now, ...path.points.filter((p) => p.t > elapsed && p.t <= end).map((p) => p.position)], hostile });
    if (shot.position) streaks.push({ points: [along(path.points, Math.max(0, elapsed - 0.5)), shot.position], hostile });
    if (mark) {
      markers.push({ id: `rg:${shot.id}`, kind: "impact", position: mark.position, label: `RG T-${formatCountdown(mark.t)}`, allegiance: shot.allegiance });
    }
  }
  return { lines, streaks, markers };
}

/**
 * Lost contacts (M4 Sensors Lite): one dashed line from where each was last seen along its
 * last course, `aheadS` seconds of travel long. Not a guess of where it is: where it went
 * is the player's call.
 */
export function lostCourseLines(picture: SensorPicture, aheadS: number): InterceptLine[] {
  const out: InterceptLine[] = [];
  for (const t of picture.tracks) {
    if (!t.lost || length(t.velocity) < MIN_POINTING_SPEED) continue;
    const v = t.velocity;
    out.push({ points: [t.position, { x: t.position.x + v.x * aheadS, y: t.position.y + v.y * aheadS, z: t.position.z + v.z * aheadS }], hostile: t.allegiance === "hostile" });
  }
  return out;
}

/** Below this speed a coasting object points along its heading instead of its velocity. */
const MIN_POINTING_SPEED = 0.5; // m/s

function pointingFor(burning: boolean, heading: Vec3, velocity: Vec3): Vec3 {
  if (burning || length(velocity) < MIN_POINTING_SPEED) return heading;
  return velocity;
}

export function buildDisplayList(picture: SensorPicture, markers: PathMarker[] = [], waypoints: Waypoint[] = []): DisplayList {
  const symbols: ShipSymbol[] = [];

  for (const s of picture.ownShips) {
    const burning = s.thrust > 0;
    symbols.push({
      id: s.id,
      shape: s.shipClass,
      allegiance: "friendly",
      filled: burning,
      rotates: true,
      position: s.position,
      pointing: pointingFor(burning, s.heading, s.velocity),
      label: s.name,
      isOwn: true,
    });
  }

  for (const t of picture.tracks) {
    const lost = t.lost;
    let label = t.kind === "torpedo" ? null : t.label;
    if (lost && label) label = `${label} · LAST SEEN ${formatCountdown(lost.ageS)}`;
    const shape: SymbolShape =
      t.kind === "torpedo" ? "torpedo" :
      t.kind === "station" ? "station" :
      !t.identified || !t.shipClass ? "unknown" :
      t.shipClass;
    symbols.push({
      id: t.id,
      shape,
      allegiance: t.allegiance,
      filled: t.burning && !lost,
      rotates: shape !== "station" && shape !== "unknown",
      position: t.position,
      pointing: pointingFor(t.burning, t.heading, t.velocity),
      label,
      isOwn: false,
      ...(lost ? { lost: true, fade: lost.fade } : {}),
    });
  }

  const bodies: BodySymbol[] = picture.bodies.map((b) => ({
    id: b.id,
    kind: b.kind,
    name: b.name,
    position: b.position,
    radius: b.radius,
  }));

  return { symbols, bodies, markers, waypoints };
}
