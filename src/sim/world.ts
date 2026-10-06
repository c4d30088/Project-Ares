import type { Vec3 } from "./vec3";
import type { NavOrder, NavState, QueuedCommand, SimEvent } from "./commands";
import type { Target } from "./target";
import type { Personality } from "../data/ai";

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
  /** G-strain, 0 (none) to 1 (full); and time held at full strain toward the next
   *  casualties (see crew.ts). */
  strain: number;
  casualtyS: number;
  /** Set when destroyed; removed from the world at the end of the tick. */
  destroyed?: boolean;
  /** Set when a retreating ship gets clear of the fight; removed at the end of the tick. */
  escaped?: boolean;
  /** Weapons state: magazine, tubes, queued launches. */
  weapons: Weapons;
  /** Sensors switch (M4 Sensors Lite): on finds dark contacts nearby but makes the ship loud. */
  sensorsOn: boolean;
  /** Seconds the ship stays loud after its drive stops or it fires (see sensors/detect.ts). */
  loudS: number;
  /** Heat from running dark, 0 (cool) to 1 (full: damage), and time held at full (heat.ts). */
  heat: number;
  overheatS: number;
  /** Test aid: show this ship as an unknown contact (perfect-information pictures only). */
  testShowAsUnknown?: boolean;
}

export type LaunchMode = "hot" | "cold";

export interface Weapons {
  /** Torpedoes left in the magazine (not counting those already in the queue). */
  magazine: number;
  /** Seconds until each tube can fire again (0 = ready). */
  tubeReload: number[];
  /** Torpedoes ordered but not yet out of a tube, in order, with their salvo number. */
  launchQueue: { target: Target; mode: LaunchMode; salvo: number }[];
  /** Salvos ordered so far (numbers them). */
  salvos: number;
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
  /** What the gunner aimed at: the predicted meeting point and the flight time to it. */
  aim: { point: Vec3; t: number };
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
  /** Salvo hold: waiting, dark, for the rest of this salvo to leave the tubes. */
  holdSalvo?: number;
  /** The target as the seeker last saw it (M4 Sensors Lite). Out of sight, the torpedo flies
   *  on this; `blind` is set while it does. */
  seen?: { position: Vec3; velocity: Vec3; tick: number };
  blind?: boolean;
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
  /** Scripted ships (src/sim/ai). They act only through commands. */
  ai: AiScript[];
  /** Shared state of scripted ships acting together, by group name. */
  aiGroups: Record<string, { nextSalvoS: number; salvoAtS: number | null }>;
  /** What each side knows (M4 Sensors Lite): its contacts, by entity id. One datalink
   *  network per side, so a side's ships share one set (see sensors/tracks.ts). */
  sensors: Record<FactionId, Record<string, ContactRecord>>;
  /** Everyone sees everything (tests and scenarios written before sensors). */
  perfectInfo?: boolean;
  /** A prediction's copy of the world: sensors are not swept, what each side knew at the
   *  copy is kept as it was. */
  ghost?: boolean;
}

/** What a side knows about one contact. Seen means known (class, name, motion). */
export interface ContactRecord {
  id: string;
  kind: "ship" | "torpedo";
  faction: FactionId;
  /** Seen means known: name and class come with the first sighting. */
  name: string;
  shipClass?: ShipClass;
  /** Own ships that see it right now (CLAUDE.md rule 11). Empty while it is not seen. */
  seenBy: string[];
  /** When it was last seen, and its motion then. */
  seenTick: number;
  position: Vec3;
  velocity: Vec3;
  heading: Vec3;
  burning: boolean;
  /** Its Sensors were on when last seen (ships). */
  sensorsOn: boolean;
}

/** A scripted ship and its settings (scenario `ai` entries): the fixed routine of M3 or
 *  an AI captain (M5). */
export type AiScript = SkirmisherScript | CaptainScript;

/** What a captain is doing with its ship right now (src/sim/ai/captain.ts). */
export type CaptainMode = "station" | "orient" | "evade" | "retreat" | "cover";

/** An AI captain: scores its options each second from its own side's picture. */
export interface CaptainScript {
  ship: string;
  behavior: "captain";
  /** Ships with the same group share a salvo clock and time their salvos to arrive together. */
  group?: string;
  personality: Personality;
  state: {
    nextThinkTick: number;
    salvos: number;
    navIssuedS: number;
    launchAtS: number | null;
    /** The behavior it chose, and the one whose order it last gave (to avoid repeating orders). */
    mode: CaptainMode | null;
    issuedMode: CaptainMode | null;
  };
}

export interface SkirmisherScript {
  ship: string;
  behavior: "skirmisher";
  /** Ships with the same group share a salvo clock and time their salvos to arrive together. */
  group?: string;
  /** Holds about this far from its target, m. */
  engageRange: number;
  /** Fires torpedo salvos inside this range, m, this many at a time, this often, s. */
  launchRange: number;
  salvoSize: number;
  salvoIntervalS: number;
  /** Every Nth salvo is launched cold (0 = never). */
  coldEvery: number;
  /** Fires its railgun inside this range, m (0 = never). */
  railgunRange: number;
  /** Script state. */
  state: { nextThinkTick: number; salvos: number; navIssuedS: number; launchAtS: number | null };
}

export function areHostile(world: World, a: FactionId, b: FactionId): boolean {
  const fa = world.factions.find((f) => f.id === a);
  const fb = world.factions.find((f) => f.id === b);
  return !!(fa?.hostileTo.includes(b) || fb?.hostileTo.includes(a));
}
