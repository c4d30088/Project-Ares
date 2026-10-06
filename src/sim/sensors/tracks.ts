// What each side knows (M4 Sensors Lite). Every tick, each side's ships look at every other
// side's ships and torpedoes with the rules in detect.ts. One datalink network per side, so
// what one ship sees, all its side knows, and every contact records which ships see it
// (CLAUDE.md rule 11).
//
// A contact nobody sees any more is followed along its last motion for a moment
// (lostAfterS, against flicker at the edge of a range), then it is lost: the side keeps
// where and when it was last seen and how it was moving, and nothing else. A lost contact
// fades out after lostFadeS. One that was in view when it vanished (destroyed, or got away)
// is dropped at once.

import { sensorTuning as S } from "../../data/sensors";
import { TICK_RATE } from "../sim";
import { add, clone, scale, type Vec3 } from "../vec3";
import type { ContactRecord, FactionId, Ship, Torpedo, World } from "../world";
import { sees } from "./detect";

export function sweepSensors(world: World): void {
  if (world.perfectInfo || world.ghost) return;
  const graceTicks = Math.round(S.lostAfterS * TICK_RATE);
  const dropTicks = Math.round((S.lostAfterS + S.lostFadeS) * TICK_RATE);
  const alive = new Set<string>();
  for (const s of world.ships) if (!s.destroyed && !s.escaped) alive.add(s.id);
  for (const t of world.torpedoes) if (!t.destroyed) alive.add(t.id);

  for (const f of world.factions) {
    const recs = (world.sensors[f.id] ??= {});
    const observers = world.ships.filter((s) => s.faction === f.id && alive.has(s.id));
    const look = (c: Ship | Torpedo, kind: ContactRecord["kind"]) => {
      if (c.faction === f.id || !alive.has(c.id)) return;
      const seenBy = observers.filter((o) => sees(world.bodies, o, c)).map((o) => o.id);
      if (seenBy.length) {
        recs[c.id] = {
          id: c.id,
          kind,
          faction: c.faction,
          name: kind === "ship" ? (c as Ship).name : c.id,
          ...(kind === "ship" ? { shipClass: (c as Ship).shipClass } : {}),
          seenBy,
          seenTick: world.tick,
          position: clone(c.position),
          velocity: clone(c.velocity),
          heading: clone(c.heading),
          burning: c.thrust > 0,
          sensorsOn: kind === "ship" ? (c as Ship).sensorsOn : false,
        };
      } else if (recs[c.id]) {
        recs[c.id].seenBy = [];
      }
    };
    for (const s of world.ships) look(s, "ship");
    for (const t of world.torpedoes) look(t, "torpedo");

    for (const id of Object.keys(recs)) {
      const r = recs[id];
      const age = world.tick - r.seenTick;
      if (!alive.has(id) && age <= graceTicks) delete recs[id]; // seen going
      else if (age > dropTicks) delete recs[id];
      else if (!alive.has(id)) r.seenBy = [];
    }
  }
}

/** How a side's contact stands now. */
export interface ContactStatus {
  /** Seen this tick, or only a moment ago (still followed along its motion). */
  live: boolean;
  /** Seconds since it was last seen. */
  ageS: number;
  /** For lost contacts: 1 just lost, falling to 0 when it is dropped. */
  fade: number;
}

export function contactStatus(world: World, r: ContactRecord): ContactStatus {
  const ageS = (world.tick - r.seenTick) / TICK_RATE;
  const live = ageS <= S.lostAfterS;
  const fade = live ? 1 : Math.max(0, 1 - (ageS - S.lostAfterS) / S.lostFadeS);
  return { live, ageS, fade };
}

/** Where the side thinks the contact is now: its last position carried along its last
 *  motion (a straight line; the course line drawn for lost contacts). */
export function estimatePosition(world: World, r: ContactRecord): Vec3 {
  const ageS = (world.tick - r.seenTick) / TICK_RATE;
  return add(r.position, scale(r.velocity, ageS));
}

/** A side's record of a contact, if it has one. */
export function contactOf(world: World, faction: FactionId, id: string): ContactRecord | undefined {
  return world.sensors[faction]?.[id];
}

/** The side sees this ship or torpedo right now (or the world is perfect information). */
export function sideSees(world: World, faction: FactionId, id: string): boolean {
  if (world.perfectInfo) return true;
  return (world.sensors[faction]?.[id]?.seenBy.length ?? 0) > 0;
}

/**
 * At the start of a fight each side knows where every enemy ship was (a briefing), as a
 * lost contact: LAST SEEN at the start, with its motion then. Without it a dark ship could
 * never be found and nobody would know where to look.
 */
export function briefSides(world: World): void {
  if (world.perfectInfo) return;
  const lostTick = world.tick - Math.round(S.lostAfterS * TICK_RATE) - 1;
  for (const f of world.factions) {
    const recs = (world.sensors[f.id] ??= {});
    for (const s of world.ships) {
      if (s.faction === f.id || recs[s.id]) continue;
      recs[s.id] = {
        id: s.id,
        kind: "ship",
        faction: s.faction,
        name: s.name,
        shipClass: s.shipClass,
        seenBy: [],
        seenTick: lostTick,
        position: clone(s.position),
        velocity: clone(s.velocity),
        heading: clone(s.heading),
        burning: false,
        sensorsOn: s.sensorsOn,
      };
    }
  }
}
