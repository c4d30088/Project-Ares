// Sound rules: we hear our own ship and what our side has detected, nothing else.

import { describe, expect, it } from "vitest";
import { audioTuning } from "../src/data/audio";
import { beepInterval, createThrottle, cuesFromEvents, cuesFromSignals, driveLevel, type CueContext } from "../src/game/soundCues";
import type { SimEvent } from "../src/sim/commands";

const factions: Record<string, string> = { us1: "blue", them1: "red", them2: "red", ally: "green" };
const ctx: CueContext = {
  playerFaction: "blue",
  hostile: (a, b) => a !== b && a !== "green" && b !== "green",
  factionOf: (id) => factions[id],
};
const at = { x: 0, y: 0, z: 0 };

describe("sound cues from sim events", () => {
  it("our launches are heard; a salvo is one cue with a count", () => {
    const events: SimEvent[] = [1, 2, 3].map((i) => ({ type: "torpedoLaunched", ship: "us1", torpedo: `t${i}`, faction: "blue", mode: "hot" }));
    expect(cuesFromEvents(events, ctx)).toEqual([{ name: "launchOwn", count: 3 }]);
  });

  it("enemy launches and railgun shots are never heard from events (the picture reports them)", () => {
    const events: SimEvent[] = [
      { type: "torpedoLaunched", ship: "them1", torpedo: "t9", faction: "red", mode: "cold" },
      { type: "railgunFired", ship: "them1", faction: "red", slug: "s1" },
      { type: "pdcKill", ship: "them1", faction: "red", mount: 1, torpedo: "t1", target: "torpedo", position: at },
    ];
    expect(cuesFromEvents(events, ctx)).toEqual([]);
  });

  it("hits on us: heavy for torpedoes and slugs, light rattle for PDC fire", () => {
    const hit = (cause: string): SimEvent => ({ type: "damage", ship: "us1", faction: "blue", attacker: "red", subsystem: "hull", side: "front", cause, position: at, hull: 0.1, amount: 0 });
    expect(cuesFromEvents([hit("torpedo")], ctx)).toEqual([{ name: "hitOwn", count: 1 }]);
    expect(cuesFromEvents([hit("pdc"), hit("pdc")], ctx)).toEqual([{ name: "hitOwnLight", count: 2 }]);
  });

  it("hits on the enemy are not heard as hits on us", () => {
    const e: SimEvent = { type: "damage", ship: "them1", faction: "red", attacker: "blue", subsystem: "hull", side: "front", cause: "torpedo", position: at, hull: 0.2, amount: 0 };
    expect(cuesFromEvents([e], ctx)).toEqual([]);
  });

  it("ship kills: ours lost, enemy killed, a third party ignored", () => {
    const kill = (id: string): SimEvent => ({ type: "destroyed", id, cause: "torpedo", kind: "ship", position: at });
    expect(cuesFromEvents([kill("us1")], ctx)).toEqual([{ name: "ownLost", count: 1 }]);
    expect(cuesFromEvents([kill("them2")], ctx)).toEqual([{ name: "enemyKilled", count: 1 }]);
    expect(cuesFromEvents([kill("ally")], ctx)).toEqual([]);
    // A torpedo destroyed is not a ship kill.
    expect(cuesFromEvents([{ type: "destroyed", id: "t1", cause: "pdc", kind: "torpedo", position: at }], ctx)).toEqual([]);
  });

  it("our PDCs shooting something down pops; our subsystems failing alarms", () => {
    const events: SimEvent[] = [
      { type: "pdcKill", ship: "us1", faction: "blue", mount: 2, torpedo: "t4", target: "torpedo", position: at },
      { type: "subsystemDestroyed", ship: "us1", subsystem: "pdc2", position: at },
      { type: "subsystemDestroyed", ship: "them1", subsystem: "drive", position: at },
    ];
    expect(cuesFromEvents(events, ctx)).toEqual([
      { name: "pdcKillOwn", count: 1 },
      { name: "subsystemOffline", count: 1 },
    ]);
  });
});

describe("sound cues from the picture", () => {
  it("maps detections and the result to alarms", () => {
    const cues = cuesFromSignals([
      { type: "launchDetected" },
      { type: "launchDetected" },
      { type: "contact" },
      { type: "outcome", result: "win" },
      { type: "outcome", result: "draw" },
    ]);
    expect(cues).toEqual([
      { name: "launchWarning", count: 2 },
      { name: "contact", count: 1 },
      { name: "victory", count: 1 },
    ]);
  });
});

describe("throttle", () => {
  it("keeps one kind of sound from repeating faster than its gap, others unaffected", () => {
    const th = createThrottle();
    expect(th.allow("launchWarning", 0)).toBe(true);
    expect(th.allow("launchWarning", audioTuning.warningGapS / 2)).toBe(false);
    expect(th.allow("contact", audioTuning.warningGapS / 2)).toBe(true);
    expect(th.allow("launchWarning", audioTuning.warningGapS + 0.01)).toBe(true);
  });

  it("our own launches are never throttled", () => {
    const th = createThrottle();
    expect(th.allow("launchOwn", 0)).toBe(true);
    expect(th.allow("launchOwn", 0)).toBe(true);
  });
});

describe("impact countdown beeps", () => {
  it("silent beyond the start, then faster as impact nears", () => {
    expect(beepInterval(null)).toBeNull();
    expect(beepInterval(audioTuning.impactBeepS + 1)).toBeNull();
    const early = beepInterval(audioTuning.impactBeepS)!;
    const mid = beepInterval(audioTuning.impactBeepS / 2)!;
    const late = beepInterval(0)!;
    expect(early).toBeCloseTo(audioTuning.beepSlowS);
    expect(late).toBeCloseTo(audioTuning.beepFastS);
    expect(mid).toBeLessThan(early);
    expect(mid).toBeGreaterThan(late);
  });
});

describe("drive rumble", () => {
  it("grows with acceleration and caps at full", () => {
    expect(driveLevel(0)).toBe(0);
    expect(driveLevel(audioTuning.driveFullG / 2)).toBeCloseTo(0.5);
    expect(driveLevel(audioTuning.driveFullG * 3)).toBe(1);
  });
});
