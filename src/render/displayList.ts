// Turns the player's sensor picture into a flat list of symbols to draw.
// Pure function: no three.js, so it can be unit tested.

import type { Allegiance, SensorPicture } from "../sim/sensors/picture";
import type { Prediction } from "../sim/predict";
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
  kind: "flip" | "arrival";
  position: Vec3;
  label: string;
  allegiance: Allegiance;
}

/** A point being placed for an order: crosshair, drop line and label. */
export interface Waypoint {
  id: string;
  position: Vec3;
  label: string;
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
    const shape: SymbolShape =
      t.kind === "torpedo" ? "torpedo" :
      t.kind === "station" ? "station" :
      !t.identified || !t.shipClass ? "unknown" :
      t.shipClass;
    symbols.push({
      id: t.id,
      shape,
      allegiance: t.allegiance,
      filled: t.burning,
      rotates: shape !== "station" && shape !== "unknown",
      position: t.position,
      pointing: pointingFor(t.burning, t.heading, t.velocity),
      label: t.kind === "torpedo" ? null : t.label,
      isOwn: false,
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
