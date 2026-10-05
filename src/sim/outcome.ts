// Win and loss (M5). A pure check of the world: the game asks it after every tick, so the
// sim itself stays free of "who is the player".
//
// Loss: none of the player's ships is left. Win: no hostile ship is left, destroyed or
// escaped (a retreating AI ship that gets clear of the fight, see ai/captain.ts), and none of
// their torpedoes is still hunting. Both sides gone at once is a draw. Scenarios that start
// with no hostile ships have no win.

import { areHostile, type World } from "./world";

export type OutcomeResult = "win" | "loss" | "draw";

export interface Outcome {
  result: OutcomeResult;
  /** Big banner word. */
  title: "VICTORY" | "DEFEAT" | "DRAW";
  /** One line saying why. */
  detail: string;
  /** Sim tick it was reached. */
  tick: number;
}

/** What the check needs to know that the world no longer holds. */
export interface OutcomeContext {
  /** Hostile ships there were at the start. 0: nothing to win. */
  hostileAtStart: number;
  /** Hostile ships that have escaped since. */
  escaped: number;
}

export function evaluateOutcome(world: World, playerFaction: string, ctx: OutcomeContext): Outcome | null {
  const ours = world.ships.some((s) => s.faction === playerFaction);
  const hostile = world.ships.some((s) => areHostile(world, playerFaction, s.faction));
  const armed = ctx.hostileAtStart > 0;
  if (!ours) {
    return armed && !hostile
      ? { result: "draw", title: "DRAW", detail: "BOTH SIDES DESTROYED", tick: world.tick }
      : { result: "loss", title: "DEFEAT", detail: "ALL OUR SHIPS LOST", tick: world.tick };
  }
  if (!armed || hostile) return null;
  // Torpedoes still flying keep the fight on (a mine waiting in search does not).
  const hunting = world.torpedoes.some((t) => areHostile(world, playerFaction, t.faction) && t.guidance?.stage !== "search");
  if (hunting) return null;
  const detail =
    ctx.escaped === 0 ? "ALL TARGETS DESTROYED" : ctx.escaped >= ctx.hostileAtStart ? "ENEMY BROKE OFF" : "ENEMY DESTROYED OR DRIVEN OFF";
  return { result: "win", title: "VICTORY", detail, tick: world.tick };
}
