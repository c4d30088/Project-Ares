// Commands are the only way to change sim state (CLAUDE.md rule 5). The player and the AI
// both submit them; the sim applies them at the start of the next tick.

import type { Target } from "./target";
import type { Vec3 } from "./vec3";
import type { GSetting } from "./world";

export type Command =
  | { type: "burnTo"; ship: string; point: Vec3; g?: GSetting }
  | { type: "intercept"; ship: string; target: Target; mode: "rendezvous" | "fastPass"; g?: GSetting }
  | { type: "matchVelocity"; ship: string; target: Target; g?: GSetting }
  | { type: "stationKeep"; ship: string; target: Target; g?: GSetting }
  | { type: "coast"; ship: string }
  | { type: "orient"; ship: string; target: Target }
  | { type: "setG"; ship: string; g: GSetting };

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
  | { type: "orient"; target: Target };

/** What the nav computer is doing right now, for display and events. */
export type NavPhase = "coast" | "turn" | "burn" | "flip" | "brake" | "hold";

export interface NavState {
  phase: NavPhase;
  /** Braking has started (burnTo / rendezvous). Stays set until the order changes. */
  braking: boolean;
  /** The order has reached its goal at least once. */
  complete: boolean;
  /** Fast pass: closest approach seen so far, to detect when it is behind the ship. */
  closestApproach: number;
}

export const freshNavState = (): NavState => ({
  phase: "coast",
  braking: false,
  complete: false,
  closestApproach: Infinity,
});

export type SimEvent =
  | { type: "flipStart"; ship: string }
  | { type: "orderComplete"; ship: string; order: NavOrder["type"] }
  | { type: "commandRejected"; faction: string; command: Command; reason: string };
