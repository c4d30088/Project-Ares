import type { Vec3 } from "./vec3";

export type ShipClass = "corvette" | "frigate" | "destroyer" | "cruiser" | "capital";
export type FactionId = string;

export interface Faction {
  id: FactionId;
  name: string;
  hostileTo: FactionId[];
}

export interface Ship {
  id: string;
  name: string;
  faction: FactionId;
  shipClass: ShipClass;
  position: Vec3;
  velocity: Vec3;
  /** Unit vector along the bow. The main drive pushes along this. */
  heading: Vec3;
  /** Current drive acceleration in m/s². 0 means coasting. */
  thrust: number;
  /** Test aid until real sensors exist (M4): show this ship as an unknown contact. */
  testShowAsUnknown?: boolean;
}

export interface Torpedo {
  id: string;
  faction: FactionId;
  position: Vec3;
  velocity: Vec3;
  heading: Vec3;
  thrust: number;
}

export interface Station {
  id: string;
  name: string;
  faction: FactionId;
  position: Vec3;
  velocity: Vec3;
}

export type BodyKind = "planet" | "moon" | "asteroid";

export interface Body {
  id: string;
  name: string;
  kind: BodyKind;
  position: Vec3;
  radius: number;
}

export interface World {
  tick: number;
  factions: Faction[];
  ships: Ship[];
  torpedoes: Torpedo[];
  stations: Station[];
  bodies: Body[];
}

export function areHostile(world: World, a: FactionId, b: FactionId): boolean {
  const fa = world.factions.find((f) => f.id === a);
  const fb = world.factions.find((f) => f.id === b);
  return !!(fa?.hostileTo.includes(b) || fb?.hostileTo.includes(a));
}
