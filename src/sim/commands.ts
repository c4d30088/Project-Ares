// Commands are the only way to change sim state (CLAUDE.md rule 5). The player and the AI
// both submit them; the sim applies them at the start of the next tick.

import type { Target } from "./target";
import type { Vec3 } from "./vec3";
import type { GSetting, LaunchMode } from "./world";

export type Command =
  | { type: "burnTo"; ship: string; point: Vec3; g?: GSetting }
  | { type: "intercept"; ship: string; target: Target; mode: "rendezvous" | "fastPass"; g?: GSetting }
  | { type: "matchVelocity"; ship: string; target: Target; g?: GSetting }
  | { type: "stationKeep"; ship: string; target: Target; g?: GSetting }
  | { type: "coast"; ship: string }
  | { type: "orient"; ship: string; target: Target }
  | { type: "orbit"; ship: string; target: Target; g?: GSetting }
  | { type: "setG"; ship: string; g: GSetting }
  /** Queues `count` torpedoes at a target. Tubes fire as they are ready, so big salvos
   *  leave in waves. Never automatic (CLAUDE.md rule 10). */
  | { type: "launchTorpedoes"; ship: string; target: Target; count: number; mode: LaunchMode }
  /** PDC mode for one mount (0-based) or all; Manual with a target assigns it. */
  | { type: "setPdcs"; ship: string; mount: number | "all"; mode: "auto" | "manual" | "hold"; target?: Target }
  /** Fires one railgun slug at a target (a ship: at its lead point). Never automatic. */
  | { type: "fireRailgun"; ship: string; target: Target }
  /** Burst fire for PDCs on Auto: rounds per burst and the pause between bursts. */
  | { type: "setPdcBurst"; ship: string; enabled: boolean; rounds: number; intervalS: number }
  /** Sensors on or off (M4 Sensors Lite): on finds dark contacts nearby, but makes the ship
   *  loud. Never changes the nav order. */
  | { type: "setSensors"; ship: string; on: boolean };

export interface QueuedCommand {
  tick: number;
  faction: string;
  command: Command;
}

/** A nav order as the ship holds it. Station-keep stores its offset from the target. */
export type NavOrder =
  | { type: "burnTo"; point: Vec3 }
  | { type: "intercept"; target: Target; mode: "rendezvous" | "fastPass" }
  | { type: "matchVelocity"; target: Target }
  | { type: "stationKeep"; target: Target; offset: Vec3 }
  | { type: "orient"; target: Target }
  /** Circular orbit around a body: radius, plane normal (motion is counter-clockwise about
   *  it) and the entry point relative to the body's center. */
  | { type: "orbit"; target: Target; radius: number; normal: Vec3; entry: Vec3 };

/** What the nav computer is doing right now, for display and events. */
/** "avoid": body avoidance has taken over to swerve clear of a body. */
export type NavPhase = "coast" | "turn" | "burn" | "flip" | "brake" | "hold" | "orbit" | "avoid";

export interface NavState {
  phase: NavPhase;
  /** Braking has started (burnTo / rendezvous). Stays set until the order changes. */
  braking: boolean;
  /** The order has reached its goal at least once. */
  complete: boolean;
  /** Fast pass: closest approach seen so far, to detect when it is behind the ship. */
  closestApproach: number;
  /** Station-keep: the ship has left the hold box and is travelling back to station. */
  travelling: boolean;
  /** Orbit: flying to the entry point, burning up to orbital speed, or in orbit. */
  orbitStage: "approach" | "insert" | "orbit";
  /** Body avoidance has taken over (it lets go once clear by a wider margin). */
  avoiding: boolean;
}

export const freshNavState = (): NavState => ({
  phase: "coast",
  braking: false,
  complete: false,
  closestApproach: Infinity,
  travelling: false,
  orbitStage: "approach",
  avoiding: false,
});

export type SimEvent =
  | { type: "flipStart"; ship: string }
  | { type: "orderComplete"; ship: string; order: NavOrder["type"] }
  | { type: "commandRejected"; faction: string; command: Command; reason: string }
  /** A hit on a ship. `hull` and `amount` are the fractions of hull and of the struck
   *  subsystem lost (amount is 0 when only the hull was struck); `attacker` is the faction
   *  that fired. The effects and the alert log read these. */
  | {
      type: "damage"; ship: string; faction: string; attacker: string; subsystem: string; side: string; cause: string;
      position: Vec3; hull: number; amount: number;
    }
  | { type: "subsystemDestroyed"; ship: string; subsystem: string; position: Vec3 }
  /** A retreating ship got clear of the fight and left it. */
  | { type: "escaped"; ship: string; faction: string }
  | { type: "destroyed"; id: string; cause: string; kind: "ship" | "torpedo" | "slug"; position: Vec3 }
  | { type: "torpedoLaunched"; ship: string; torpedo: string; faction: string; mode: LaunchMode }
  | { type: "torpedoDetonated"; torpedo: string; faction: string; hit: string; position: Vec3 }
  /** A torpedo removed without hitting anything: spent after a miss, or a mine timing out. */
  | { type: "torpedoExpired"; torpedo: string; reason: "spent" | "timeout" }
  /** A PDC destroyed an incoming torpedo or slug (`torpedo` holds its id either way). */
  | { type: "pdcKill"; ship: string; faction: string; mount: number; torpedo: string; target: "torpedo" | "slug"; position: Vec3 }
  | { type: "pdcAmmoOut"; ship: string; mount: number }
  | { type: "railgunFired"; ship: string; faction: string; slug: string }
  | { type: "slugHit"; slug: string; faction: string; hit: string; position: Vec3 }
  /** Crew losses from holding full G-strain. */
  | { type: "crewCasualties"; ship: string };
