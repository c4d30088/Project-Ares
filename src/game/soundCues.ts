// Which sounds to play, decided from sim events and the game's picture signals. Pure
// functions, so the rules are testable; src/audio/synth.ts makes the actual sounds.
//
// We hear our own ship and its bridge (DESIGN.md section 12, M6): our launches, our railgun,
// our PDCs, hits on us, and the alarms for what our side has detected. Enemy launches and
// railgun fire come from the picture (game signals), never from events, so a hidden enemy
// is never heard (CLAUDE.md rule 6).

import { audioTuning } from "../data/audio";
import type { SimEvent } from "../sim/commands";

export type CueName =
  | "launchOwn"
  | "railgunOwn"
  | "pdcKillOwn"
  | "hitOwn"
  | "hitOwnLight"
  | "subsystemOffline"
  | "ownLost"
  | "enemyKilled"
  | "launchWarning"
  | "railgunWarning"
  | "contact"
  | "contactLost"
  | "enemySensors"
  | "heatCritical"
  | "victory"
  | "defeat";

/** One sound to play; `count` is how many of it happened at once (a salvo of 6 is one cue). */
export interface Cue {
  name: CueName;
  count: number;
}

/** What game.ts reports from the player's picture (see Game.takeSignals). */
export type GameSignal =
  | { type: "contact" }
  | { type: "contactLost" }
  | { type: "enemySensors" }
  | { type: "launchDetected" }
  | { type: "railgunDetected" }
  | { type: "outcome"; result: "win" | "loss" | "draw" };

export interface CueContext {
  playerFaction: string;
  hostile(a: string, b: string): boolean;
  /** Faction of a ship, including one that has just been destroyed. */
  factionOf(shipId: string): string | undefined;
}

function add(out: Cue[], name: CueName) {
  const c = out.find((x) => x.name === name);
  if (c) c.count++;
  else out.push({ name, count: 1 });
}

/** Sounds for sim events: only what happens to or from our own side. */
export function cuesFromEvents(events: SimEvent[], ctx: CueContext): Cue[] {
  const out: Cue[] = [];
  const own = (faction: string | undefined) => faction === ctx.playerFaction;
  const enemy = (faction: string | undefined) => faction !== undefined && ctx.hostile(ctx.playerFaction, faction);
  for (const e of events) {
    switch (e.type) {
      case "torpedoLaunched":
        if (own(e.faction)) add(out, "launchOwn");
        break;
      case "railgunFired":
        if (own(e.faction)) add(out, "railgunOwn");
        break;
      case "pdcKill":
        if (own(e.faction)) add(out, "pdcKillOwn");
        break;
      case "damage":
        if (own(e.faction)) add(out, e.cause === "pdc" ? "hitOwnLight" : "hitOwn");
        break;
      case "subsystemDestroyed":
        if (own(ctx.factionOf(e.ship))) add(out, "subsystemOffline");
        break;
      case "overheat":
        if (own(ctx.factionOf(e.ship))) add(out, "heatCritical");
        break;
      case "destroyed":
        if (e.kind !== "ship") break;
        if (own(ctx.factionOf(e.id))) add(out, "ownLost");
        else if (enemy(ctx.factionOf(e.id))) add(out, "enemyKilled");
        break;
      default:
        break;
    }
  }
  return out;
}

const SIGNAL_CUE: Record<Exclude<GameSignal["type"], "outcome">, CueName> = {
  contact: "contact",
  contactLost: "contactLost",
  enemySensors: "enemySensors",
  launchDetected: "launchWarning",
  railgunDetected: "railgunWarning",
};

/** Sounds for what our side's picture shows: contacts, detected launches and fire, the end. */
export function cuesFromSignals(signals: GameSignal[]): Cue[] {
  const out: Cue[] = [];
  for (const s of signals) {
    if (s.type === "outcome") {
      if (s.result === "win") add(out, "victory");
      else if (s.result === "loss") add(out, "defeat");
    } else add(out, SIGNAL_CUE[s.type]);
  }
  return out;
}

/** Shortest real-time gap between two plays of a cue (seconds); 0 for no limit. */
export function cueGap(name: CueName): number {
  switch (name) {
    case "pdcKillOwn":
      return audioTuning.pdcKillGapS;
    case "hitOwn":
    case "hitOwnLight":
      return audioTuning.hitGapS;
    case "launchWarning":
    case "railgunWarning":
      return audioTuning.warningGapS;
    case "contact":
    case "contactLost":
    case "enemySensors":
      return 0.6;
    default:
      return 0;
  }
}

/** Keeps a cue from repeating faster than its gap. `now` is real seconds. */
export function createThrottle() {
  const last = new Map<CueName, number>();
  return {
    allow(name: CueName, now: number): boolean {
      const prev = last.get(name);
      if (prev !== undefined && now - prev < cueGap(name)) return false;
      last.set(name, now);
      return true;
    },
    reset() {
      last.clear();
    },
  };
}

/** Seconds between impact countdown beeps when the nearest hit is `t` sim seconds away, or
 *  null for no beeping. Beeps speed up steadily from beepSlowS to beepFastS. */
export function beepInterval(t: number | null): number | null {
  const start = audioTuning.impactBeepS;
  if (t === null || t > start || start <= 0) return null;
  const f = Math.max(0, t) / start;
  return audioTuning.beepFastS + (audioTuning.beepSlowS - audioTuning.beepFastS) * f;
}

/** The continuous sounds: drive rumble, PDC fire, and the impact countdown. */
export interface SoundState {
  /** Drive rumble strength, 0..1. */
  drive: number;
  /** Our PDC mounts firing right now. */
  pdcsFiring: number;
  /** Sim seconds to the nearest incoming torpedo or slug on our ships, or null. */
  impactIn: number | null;
  /** The player is aiming our railgun and it is ready, or a shot is waiting to go: its
   *  capacitors charge (also while paused). */
  railgunCharging: boolean;
  /** Paused or fight over: the loops go quiet. */
  quiet: boolean;
}

/** Drive rumble strength for an acceleration in g. */
export function driveLevel(accelG: number): number {
  if (audioTuning.driveFullG <= 0) return 0;
  return Math.max(0, Math.min(1, accelG / audioTuning.driveFullG));
}
