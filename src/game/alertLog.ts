// The alert log: a running record of what happened, with the time it happened, so a long
// fight can be followed afterwards. Pure functions: sim events in, log lines out.
//
// Lines of the same kind that follow each other closely merge into one with a count
// ("8 torpedoes destroyed"), so a swarm is a line, not a flood.
//
// Perfect sensors until M4: events are shown wherever they happen. Enemy launches and
// railgun fire are logged from the sensor picture, like the alert strip, not from events.

import { subsystemLabel } from "../data/names";
import type { SimEvent } from "../sim/commands";

export type LogTone = "threat" | "warn" | "good" | "info";

export interface LogEntry {
  id: number;
  /** Sim time of the first event in this line, seconds. */
  t: number;
  tone: LogTone;
  text: string;
  /** Lines merged into this one. */
  count: number;
  /** Merge key and the template the text is made from (see fill()). */
  key?: string;
  tpl: string;
  /** Sim time of the latest event merged in. */
  lastT: number;
}

/** A line about to be added. */
export interface LogDraft {
  tone: LogTone;
  /** Template: {n} is the count; {one|many} picks a word by the count. */
  tpl: string;
  /** Drafts with the same key close together merge. */
  key?: string;
}

/** Most lines kept; the oldest drop off. */
export const LOG_MAX = 500;
/** Lines of one kind within this many sim seconds of each other merge. */
export const LOG_MERGE_S = 5;

export interface LogContext {
  playerFaction: string;
  hostile(a: string, b: string): boolean;
  factionOf(shipId: string): string | undefined;
  nameOf(shipId: string): string;
}

/** Fills a template for a count: "{n} {TORPEDO|TORPEDOES}" with 3 gives "3 TORPEDOES". */
export function fill(tpl: string, count: number): string {
  return tpl.replace(/\{(\d+|n)\}/g, () => String(count)).replace(/\{([^|{}]+)\|([^{}]+)\}/g, (_, one: string, many: string) => (count === 1 ? one : many));
}

/** Adds a draft to the log (merging if it can) and returns the new log. Never mutates. */
export function appendDraft(log: LogEntry[], draft: LogDraft, t: number, nextId: () => number): LogEntry[] {
  if (draft.key) {
    // Only the latest few lines are candidates, so an old line is never revived.
    for (let i = log.length - 1; i >= Math.max(0, log.length - 6); i--) {
      const e = log[i];
      if (e.key !== draft.key || t - e.lastT > LOG_MERGE_S) continue;
      const count = e.count + 1;
      const merged: LogEntry = { ...e, count, lastT: t, text: fill(e.tpl, count) };
      return [...log.slice(0, i), merged, ...log.slice(i + 1)];
    }
  }
  const entry: LogEntry = { id: nextId(), t, tone: draft.tone, text: fill(draft.tpl, 1), count: 1, key: draft.key, tpl: draft.tpl, lastT: t };
  const next = [...log, entry];
  return next.length > LOG_MAX ? next.slice(next.length - LOG_MAX) : next;
}

const CAUSE_LABEL: Record<string, string> = { torpedo: "TORPEDO", railgun: "RAILGUN SLUG", pdc: "PDC FIRE" };
const pct = (x: number) => Math.max(1, Math.round(x * 100));

/** Which way an event reads for the player: ours, the enemy's, or neither. */
function side(faction: string | undefined, ctx: LogContext): "own" | "enemy" | "other" {
  if (faction === undefined) return "other";
  if (faction === ctx.playerFaction) return "own";
  return ctx.hostile(ctx.playerFaction, faction) ? "enemy" : "other";
}

/** Log lines for sim events. (Enemy launches and railgun fire come from the picture.) */
export function draftsFromEvents(events: SimEvent[], ctx: LogContext): LogDraft[] {
  const out: LogDraft[] = [];
  for (const e of events) {
    switch (e.type) {
      case "torpedoLaunched":
        if (side(e.faction, ctx) === "own") out.push({ tone: "info", key: `launch:${e.ship}`, tpl: `${ctx.nameOf(e.ship)} LAUNCHED {n} {TORPEDO|TORPEDOES}` });
        break;
      case "railgunFired":
        if (side(e.faction, ctx) === "own") out.push({ tone: "info", tpl: `${ctx.nameOf(e.ship)} FIRED RAILGUN` });
        break;
      case "pdcKill": {
        const s = side(e.faction, ctx);
        const what = e.target === "slug" ? "{SLUG|SLUGS}" : "{TORPEDO|TORPEDOES}";
        if (s === "own") out.push({ tone: "good", key: `pdc:${e.ship}:${e.target}`, tpl: `${ctx.nameOf(e.ship)} PDCS DESTROYED {n} ${what}` });
        else if (s === "enemy") out.push({ tone: "warn", key: `pdc:${e.ship}:${e.target}`, tpl: `${ctx.nameOf(e.ship)} PDCS SHOT DOWN {n} OF OUR ${what}` });
        break;
      }
      case "damage": {
        const victim = side(e.faction, ctx);
        const tone: LogTone = victim === "own" ? "threat" : victim === "enemy" ? "good" : "info";
        const cause = CAUSE_LABEL[e.cause] ?? e.cause.toUpperCase();
        if (e.cause === "pdc") {
          out.push({ tone, key: `dmg:${e.ship}:pdc`, tpl: `${ctx.nameOf(e.ship)} HIT BY PDC FIRE: {n} {HIT|HITS}` });
          break;
        }
        const parts: string[] = [];
        if (e.hull > 0.0005) parts.push(`HULL -${pct(e.hull)}%`);
        if (e.subsystem !== "hull" && e.amount > 0.0005) parts.push(`${subsystemLabel(e.subsystem)} -${pct(e.amount)}%`);
        out.push({ tone, tpl: `${ctx.nameOf(e.ship)} HIT BY ${cause}${parts.length ? `: ${parts.join(", ")}` : ""}` });
        break;
      }
      case "subsystemDestroyed": {
        const victim = side(ctx.factionOf(e.ship), ctx);
        out.push({ tone: victim === "own" ? "threat" : victim === "enemy" ? "good" : "info", tpl: `${ctx.nameOf(e.ship)}: ${subsystemLabel(e.subsystem)} OFFLINE` });
        break;
      }
      case "destroyed":
        if (e.kind === "ship") {
          const victim = side(ctx.factionOf(e.id), ctx);
          out.push({ tone: victim === "own" ? "threat" : victim === "enemy" ? "good" : "info", tpl: `${ctx.nameOf(e.id)} DESTROYED (${e.cause.toUpperCase()})` });
        }
        break;
      case "escaped": {
        const s = side(e.faction, ctx);
        out.push({ tone: s === "enemy" ? "good" : "info", tpl: `${ctx.nameOf(e.ship)} BROKE OFF AND ESCAPED` });
        break;
      }
      case "pdcAmmoOut":
        if (side(ctx.factionOf(e.ship), ctx) === "own") out.push({ tone: "warn", tpl: `${ctx.nameOf(e.ship)}: PDC ${e.mount} OUT OF AMMO` });
        break;
      case "crewCasualties":
        if (side(ctx.factionOf(e.ship), ctx) === "own") out.push({ tone: "threat", key: `crew:${e.ship}`, tpl: `${ctx.nameOf(e.ship)}: CREW LOST TO G-STRAIN` });
        break;
      default:
        break;
    }
  }
  return out;
}
