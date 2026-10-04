import type { Vec3 } from "./vec3";
import type { NavOrder, NavState, QueuedCommand, SimEvent } from "./commands";
import type { Target } from "./target";

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
  /** Weapons state: magazine, tubes, queued launches. */
  weapons: Weapons;
  /** Test aid until real sensors exist (M4): show this ship as an unknown contact. */
  testShowAsUnknown?: boolean;
}

export type LaunchMode = "hot" | "cold";

export interface Weapons {
  /** Torpedoes left in the magazine (not counting those already in the queue). */
  magazine: number;
  /** Seconds until each tube can fire again (0 = ready). */
  tubeReload: number[];
  /** Torpedoes ordered but not yet out of a tube, in order. */
  launchQueue: { target: Target; mode: LaunchMode }[];
  /** Torpedoes launched so far (for ids). */
  launched: number;
  /** Point defense mounts, in the order of pdc1..pdcN. */
  pdcs: PdcMount[];
  /** Burst fire for mounts on Auto: off fires continuously. */
  pdcBurst: { enabled: boolean; rounds: number; intervalS: number };
  /** Railguns: seconds until each can fire again, and slugs left (shared magazine). */
  railguns: { rechargeS: number }[];
  slugs: number;
  /** Slugs fired so far (for ids). */
  slugsFired: number;
}

/**
 * A railgun slug: no drive, no signature, no guidance. Nobody tracks it in flight; both
 * sides know only the shot (where and how it was fired) and predict its path from that.
 */
export interface Slug {
  id: string;
  faction: FactionId;
  launcher: string;
  position: Vec3;
  velocity: Vec3;
  ageS: number;
  /** Damage multiplier (spinal guns hit harder). */
  damageScale: number;
  /** The shot as it left the gun: the start of every prediction of its path. */
  shot: { tick: number; origin: Vec3; velocity: Vec3 };
  destroyed?: boolean;
}

export interface PdcMount {
  /** Auto engages threats on its own; Manual fires only at `assigned`; Hold never fires. */
  mode: "auto" | "manual" | "hold";
  assigned: Target | null;
  /** What it is on now: an entity id, "point" for a barrage, or null. */
  engaged: string | null;
  /** Seconds left swinging onto the engaged target. */
  switchS: number;
  /** Rounds left (fractional while firing; shown rounded down). */
  rounds: number;
  /** Fired this tick. */
  firing: boolean;
  /** Burst fire: rounds left in the current burst, and seconds until the next one. */
  burstLeft: number;
  burstWaitS: number;
}

export interface Torpedo {
  destroyed?: boolean;
  id: string;
  faction: FactionId;
  position: Vec3;
  velocity: Vec3;
  heading: Vec3;
  /** Drive acceleration this tick, m/s². */
  thrust: number;
  /** Guided torpedoes (launched by ships). Scenario props without it fly straight. */
  guidance?: TorpedoGuidance;
}

/**
 * cold: ejected and coasting, drive dark. flight: guiding on its target. search: at its
 * point (or with its target gone), the seeker looks for a hostile ship. Mines are
 * torpedoes in search that have stopped.
 */
export type TorpedoStage = "cold" | "flight" | "search";

export interface TorpedoGuidance {
  target: Target;
  launcher: string;
  mode: LaunchMode;
  stage: TorpedoStage;
  /** Delta-v left, m/s. */
  fuel: number;
  /** Delta-v kept back from the boost for final homing, m/s. */
  reserve: number;
  /** Seconds spent searching; at the mine lifetime the torpedo self-destructs. */
  searchS: number;
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
  slugs: Slug[];
  stations: Station[];
  bodies: Body[];
}

export function areHostile(world: World, a: FactionId, b: FactionId): boolean {
  const fa = world.factions.find((f) => f.id === a);
  const fb = world.factions.find((f) => f.id === b);
  return !!(fa?.hostileTo.includes(b) || fb?.hostileTo.includes(a));
}
