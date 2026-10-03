// Turns the player's sensor picture into a flat list of symbols to draw.
// Pure function: no three.js, so it can be unit tested.

import type { Allegiance, SensorPicture } from "../sim/sensors/picture";
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

export interface DisplayList {
  symbols: ShipSymbol[];
  bodies: BodySymbol[];
}

/** Below this speed a coasting object points along its heading instead of its velocity. */
const MIN_POINTING_SPEED = 0.5; // m/s

function pointingFor(burning: boolean, heading: Vec3, velocity: Vec3): Vec3 {
  if (burning || length(velocity) < MIN_POINTING_SPEED) return heading;
  return velocity;
}

export function buildDisplayList(picture: SensorPicture): DisplayList {
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

  return { symbols, bodies };
}
