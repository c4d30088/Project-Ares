// Turns sim events into what the table should show: explosions, sparks and floating hit
// text. Pure functions (no drawing), so the rules are testable. impacts.ts draws them.
//
// Colors follow the weapon-fire rule (CLAUDE.md rule 7): green for our weapons, yellow for
// the enemy's, white for anyone else's.
//
// Perfect sensors until M4: every hit is shown wherever it happens. In M4, hits outside the
// player's sensor picture will be filtered here.

import { impactTuning as T } from "../data/impacts";
import { effectsTuning as FX } from "../data/effects";
import type { SimEvent } from "../sim/commands";
import type { Vec3 } from "../sim/vec3";
import type { PaletteToken } from "./palette";
import { subsystemLabel } from "../data/names";

export type FireColor = Extract<PaletteToken, "fireFriendly" | "fireHostile" | "neutral">;

/** Something to draw at a point in space. */
export interface ImpactEffect {
  /** bloom: a spherical explosion. sparks: a burst of short streaks. */
  kind: "bloom" | "sparks";
  position: Vec3;
  color: FireColor;
  /** Multiplier on the size (bloom) or the number and reach of sparks. */
  scale: number;
}

/** A label that floats up above a struck ship. */
export interface HitText {
  shipId: string;
  /** Where the ship was when hit (used if it is gone by the time the label draws). */
  position: Vec3;
  color: FireColor;
  /** Fractions of full hull and of each subsystem lost. */
  hull: number;
  subsystems: [string, number][];
  /** A one-off line (DESTROYED, RAILGUN OFFLINE) instead of damage numbers. */
  note: string | null;
}

export interface ImpactContext {
  playerFaction: string;
  hostile(a: string, b: string): boolean;
  /** Faction of a ship, including one that has just been destroyed. */
  factionOf(shipId: string): string | undefined;
}

export interface Impacts {
  effects: ImpactEffect[];
  texts: HitText[];
}

/** The color for a weapon fired by `faction`. */
export function fireColor(faction: string | undefined, ctx: ImpactContext): FireColor {
  if (faction === undefined) return "neutral";
  if (faction === ctx.playerFaction) return "fireFriendly";
  return ctx.hostile(ctx.playerFaction, faction) ? "fireHostile" : "neutral";
}

/** The color for something done to a ship of `victim`'s side: the other side's fire color. */
function colorAgainst(victim: string | undefined, ctx: ImpactContext): FireColor {
  if (victim === undefined) return "neutral";
  if (victim === ctx.playerFaction) return "fireHostile";
  return ctx.hostile(ctx.playerFaction, victim) ? "fireFriendly" : "neutral";
}

export function impactsFromEvents(events: SimEvent[], ctx: ImpactContext): Impacts {
  const out: Impacts = { effects: [], texts: [] };
  const wantText = (shipId: string) => T.showHitText && (T.hitTextOnOwn || ctx.factionOf(shipId) !== ctx.playerFaction);
  for (const e of events) {
    switch (e.type) {
      case "torpedoDetonated":
        out.effects.push({ kind: "bloom", position: e.position, color: fireColor(e.faction, ctx), scale: 1 });
        break;
      case "pdcKill":
        out.effects.push({ kind: "sparks", position: e.position, color: fireColor(e.faction, ctx), scale: T.sparkScale.pdcKill });
        break;
      case "slugHit":
        out.effects.push({ kind: "sparks", position: e.position, color: fireColor(e.faction, ctx), scale: T.sparkScale.slugHit });
        break;
      case "damage":
        if (e.cause === "pdc") out.effects.push({ kind: "sparks", position: e.position, color: fireColor(e.attacker, ctx), scale: T.sparkScale.pdcHit });
        if (wantText(e.ship)) {
          out.texts.push({
            shipId: e.ship,
            position: e.position,
            color: fireColor(e.attacker, ctx),
            hull: e.hull,
            subsystems: e.subsystem !== "hull" && e.amount > 0 ? [[e.subsystem, e.amount]] : [],
            note: null,
          });
        }
        break;
      case "subsystemDestroyed":
        if (wantText(e.ship)) {
          out.texts.push({ shipId: e.ship, position: e.position, color: colorAgainst(ctx.factionOf(e.ship), ctx), hull: 0, subsystems: [], note: `${subsystemLabel(e.subsystem)} OFFLINE` });
        }
        break;
      case "destroyed":
        if (e.kind === "ship") {
          out.effects.push({ kind: "bloom", position: e.position, color: colorAgainst(ctx.factionOf(e.id), ctx), scale: T.bloomShipKillScale });
          if (wantText(e.id)) {
            out.texts.push({ shipId: e.id, position: e.position, color: colorAgainst(ctx.factionOf(e.id), ctx), hull: 0, subsystems: [], note: "DESTROYED" });
          }
        }
        break;
      default:
        break;
    }
  }
  return out;
}

/** How hard the table should flicker for this frame's hits on our side, 0..1 (0: none).
 *  Losing a ship is the full flicker; a torpedo or slug hit flickers harder the more hull it
 *  took; PDC rounds on our hull flicker lightly. Scaled later by effectsTuning.hitFlicker. */
export function hitFlickerFromEvents(events: SimEvent[], ctx: ImpactContext): number {
  let f = 0;
  for (const e of events) {
    if (e.type === "damage" && e.faction === ctx.playerFaction) {
      f = Math.max(f, e.cause === "pdc" ? FX.hitFlickerPdc : Math.min(1, FX.hitFlickerMin + e.hull * FX.hitFlickerPerHull));
    } else if (e.type === "destroyed" && e.kind === "ship" && ctx.factionOf(e.id) === ctx.playerFaction) f = 1;
  }
  return f;
}

/** Hits on the same ship in the same color add up into one label. Returns null if they can't. */
export function mergeHitText(a: HitText, b: HitText): HitText | null {
  if (a.note || b.note || a.shipId !== b.shipId || a.color !== b.color) return null;
  const subsystems = new Map<string, number>(a.subsystems);
  for (const [id, amt] of b.subsystems) subsystems.set(id, (subsystems.get(id) ?? 0) + amt);
  return { ...a, position: b.position, hull: a.hull + b.hull, subsystems: [...subsystems] };
}

const pct = (x: number) => Math.max(1, Math.round(x * 100));

/** The lines of a label: "HULL -35%", "SENSORS -70%", or the note. */
export function hitTextLines(t: HitText): string[] {
  if (t.note) return [t.note];
  const lines: string[] = [];
  if (t.hull > 0.0005) lines.push(`HULL -${pct(t.hull)}%`);
  for (const [id, amt] of t.subsystems) if (amt > 0.0005) lines.push(`${subsystemLabel(id)} -${pct(amt)}%`);
  return lines;
}
