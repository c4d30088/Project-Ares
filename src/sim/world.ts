import type { Vec3 } from "./vec3";
import type { NavOrder, NavState, QueuedCommand, SimEvent } from "./commands";

export type ShipClass = "corvette" | "frigate" | "destroyer" | "cruiser" | "capital";
/** Acceleration setting for movement orders (DESIGN.md section 6). */
export type GSetting = "cruise" | "combat" | "max";
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
  /** Drive acceleration applied during the last tick, m/s². 0 means coasting. */
  thrust: number;
  g: GSetting;
  /** Current nav order. null means coast. */
  order: NavOrder | null;
  nav: NavState;
  /** Subsystem health, 1 = intact, 0 = destroyed (see damage.ts). */
  health: Record<string, number>;
  /** Set when destroyed; removed from the world at the end of the tick. */
  destroyed?: boolean;
  /** Test aid until real sensors exist (M4): show this ship as an unknown contact. */
  testShowAsUnknown?: boolean;
}

export interface Torpedo {
  destroyed?: boolean;
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
  /** G·M in m³/s². If absent, derived from radius and a default density for the kind. */
  gm?: number;
}

export interface World {
  tick: number;
  /** Seeded random state for everything random in the sim (CLAUDE.md rule 3). */
  rngState: number;
  /** Commands waiting to be applied, in submission order. */
  pending: QueuedCommand[];
  /** Events raised during the most recent tick. */
  events: SimEvent[];
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
