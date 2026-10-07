// After-action replay (M6): the pieces that are pure rules, kept apart from game.ts so they
// can be tested. The replay itself re-runs the fight in the deterministic sim from copies of the
// world taken during play, feeding the player's recorded commands back in (see game.ts).

import type { Command } from "../sim/commands";
import type { Allegiance, SensorPicture, Track } from "../sim/sensors/picture";
import type { World } from "../sim/world";
import type { LogEntry } from "./alertLog";

/** Which side's knowledge the replay shows: what we saw, what they saw, or everything. */
export type ReplayView = "ours" | "theirs" | "all";

/** Everything needed to replay a fight: copies of the world every SNAPSHOT_TICKS (and at the
 *  end), and the player's commands with the tick they were given at. */
export interface Recording {
  snapshots: { tick: number; world: World }[];
  commands: { tick: number; command: Command }[];
}

/** A copy of the world is kept every this many ticks (30 sim seconds at 20 Hz). Seeking re-runs
 *  at most this many ticks, and playback re-syncs to each copy as it passes it. */
export const SNAPSHOT_TICKS = 600;

/** The latest copy at or before `tick` (the first copy if none is). */
export function snapshotBefore(rec: Recording, tick: number): { tick: number; world: World } {
  let best = rec.snapshots[0];
  for (const s of rec.snapshots) if (s.tick <= tick && s.tick >= best.tick) best = s;
  return best;
}

/** The player's commands given at exactly this tick, in the order they were given. */
export function commandsAt(rec: Recording, tick: number): Command[] {
  return rec.commands.filter((c) => c.tick === tick).map((c) => c.command);
}

/** Moments worth marking on the replay timeline: the alert log's launches, hits, kills and
 *  losses (not the plain information lines). */
export function timelineMarks(log: LogEntry[]): { t: number; tone: LogEntry["tone"]; text: string }[] {
  return log.filter((e) => e.tone !== "info").map((e) => ({ t: e.t, tone: e.tone, text: e.text }));
}

const SWAP: Record<Allegiance, Allegiance> = { friendly: "hostile", hostile: "friendly", neutral: "neutral", unknown: "unknown" };

/**
 * The other side's picture, shown with our colors: their ships stay hostile (red), ours stay
 * friendly (blue), but only what *they* knew is there. Where they had lost one of our ships it
 * shows where they last saw it (the orange LAST SEEN marker), not where it really was.
 */
export function theirPictureInOurColors(theirs: SensorPicture): SensorPicture {
  const tracks: Track[] = theirs.tracks.map((t) => ({ ...t, allegiance: SWAP[t.allegiance] }));
  for (const s of theirs.ownShips) {
    tracks.push({
      id: s.id,
      kind: "ship",
      allegiance: "hostile",
      shipClass: s.shipClass,
      identified: true,
      label: s.name,
      position: s.position,
      velocity: s.velocity,
      heading: s.heading,
      burning: s.thrust > 0,
      contributors: [s.id],
      lastUpdateTick: theirs.tick,
      pdcFire: s.pdcs.filter((m) => m.firing && m.aimAt).map((m) => m.aimAt!),
      sensorsOn: s.sensorsOn,
    });
  }
  return {
    ...theirs,
    ownShips: [],
    tracks,
    shots: theirs.shots.map((sh) => ({ ...sh, allegiance: SWAP[sh.allegiance] })),
  };
}
