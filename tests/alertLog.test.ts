import { describe, expect, it } from "vitest";
import { scenarios } from "../src/data/scenarios";
import { appendDraft, draftsFromEvents, fill, LOG_MAX, LOG_MERGE_S, type LogContext, type LogDraft, type LogEntry } from "../src/game/alertLog";
import { createGame } from "../src/game/game";
import type { SimEvent } from "../src/sim/commands";
import { v3 } from "./helpers";

const ctx: LogContext = {
  playerFaction: "blue",
  hostile: (a, b) => (a === "blue" && b === "red") || (a === "red" && b === "blue"),
  factionOf: (id) => ({ ff: "blue", enemy: "red" } as Record<string, string>)[id],
  nameOf: (id) => ({ ff: "FF-1 WARDEN", enemy: "TRK-21" } as Record<string, string>)[id] ?? id,
};

let id = 0;
const add = (log: LogEntry[], d: LogDraft, t: number) => appendDraft(log, d, t, () => ++id);

describe("log text", () => {
  it("fills counts and picks singular or plural", () => {
    expect(fill("{n} {TORPEDO|TORPEDOES}", 1)).toBe("1 TORPEDO");
    expect(fill("{n} {TORPEDO|TORPEDOES}", 8)).toBe("8 TORPEDOES");
    expect(fill("NO COUNT HERE", 5)).toBe("NO COUNT HERE");
  });
});

describe("merging", () => {
  const kill: LogDraft = { tone: "good", key: "pdc:ff:torpedo", tpl: "PDCS DESTROYED {n} {TORPEDO|TORPEDOES}" };

  it("merges lines of one kind that follow each other closely into one with a count", () => {
    let log: LogEntry[] = [];
    for (let i = 0; i < 8; i++) log = add(log, kill, 100 + i * 0.5);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ count: 8, text: "PDCS DESTROYED 8 TORPEDOES", t: 100 });
  });

  it("starts a new line after a quiet gap, and keeps different kinds apart", () => {
    let log: LogEntry[] = [];
    log = add(log, kill, 100);
    log = add(log, kill, 100 + LOG_MERGE_S + 1);
    expect(log.map((e) => e.text)).toEqual(["PDCS DESTROYED 1 TORPEDO", "PDCS DESTROYED 1 TORPEDO"]);
    log = add(log, { ...kill, key: "pdc:ff:slug" }, 106);
    expect(log).toHaveLength(3);
    // A line with no key never merges.
    log = add(log, { tone: "info", tpl: "SHOT" }, 107);
    log = add(log, { tone: "info", tpl: "SHOT" }, 107);
    expect(log).toHaveLength(5);
  });

  it("does not edit the old log, and keeps at most LOG_MAX lines", () => {
    const one = add([], kill, 1);
    const two = add(one, kill, 2);
    expect(one[0].count).toBe(1);
    expect(two[0].count).toBe(2);
    let log: LogEntry[] = [];
    for (let i = 0; i < LOG_MAX + 25; i++) log = add(log, { tone: "info", tpl: `LINE ${i}` }, i * 100);
    expect(log).toHaveLength(LOG_MAX);
    expect(log[0].text).toBe("LINE 25");
    expect(log[log.length - 1].text).toBe(`LINE ${LOG_MAX + 24}`);
  });
});

describe("what the events say", () => {
  const damage = (over: Partial<Extract<SimEvent, { type: "damage" }>>): SimEvent => ({
    type: "damage", ship: "ff", faction: "blue", attacker: "red", subsystem: "sensors", side: "front", cause: "torpedo",
    position: v3(0, 0, 0), hull: 0.35, amount: 0.7, ...over,
  });
  const text = (events: SimEvent[]) => draftsFromEvents(events, ctx).map((d) => `${d.tone}: ${fill(d.tpl, 1)}`);

  it("a hit on us is a threat and a hit on them is good news", () => {
    expect(text([damage({})])).toEqual(["threat: FF-1 WARDEN HIT BY TORPEDO: HULL -35%, SENSORS -70%"]);
    expect(text([damage({ ship: "enemy", faction: "red", attacker: "blue", cause: "railgun", subsystem: "hull", amount: 0, hull: 0.25 })])).toEqual([
      "good: TRK-21 HIT BY RAILGUN SLUG: HULL -25%",
    ]);
  });

  it("PDC hits on a ship merge into a count rather than flooding", () => {
    let log: LogEntry[] = [];
    for (let i = 0; i < 3; i++) for (const d of draftsFromEvents([damage({ cause: "pdc", hull: 0.03, amount: 0.15 })], ctx)) log = add(log, d, 10 + i);
    expect(log.map((e) => e.text)).toEqual(["FF-1 WARDEN HIT BY PDC FIRE: 3 HITS"]);
  });

  it("our PDC kills are good, theirs on our torpedoes are warnings", () => {
    const kill = (faction: string, ship: string): SimEvent => ({ type: "pdcKill", ship, faction, mount: 1, torpedo: "t", target: "torpedo", position: v3(0, 0, 0) });
    expect(text([kill("blue", "ff")])).toEqual(["good: FF-1 WARDEN PDCS DESTROYED 1 TORPEDO"]);
    expect(text([kill("red", "enemy")])).toEqual(["warn: TRK-21 PDCS SHOT DOWN 1 OF OUR TORPEDO"]);
  });

  it("names systems lost and ships destroyed, and logs only our own launches from events", () => {
    expect(text([{ type: "subsystemDestroyed", ship: "ff", subsystem: "pdc2", position: v3(0, 0, 0) }])).toEqual(["threat: FF-1 WARDEN: PDC 2 OFFLINE"]);
    expect(text([{ type: "destroyed", id: "enemy", cause: "torpedo", kind: "ship", position: v3(0, 0, 0) }])).toEqual(["good: TRK-21 DESTROYED (TORPEDO)"]);
    // Torpedoes and slugs ending are not logged.
    expect(text([{ type: "destroyed", id: "t", cause: "pdc", kind: "torpedo", position: v3(0, 0, 0) }])).toEqual([]);
    expect(text([{ type: "torpedoLaunched", ship: "ff", torpedo: "t", faction: "blue", mode: "hot" }])).toEqual(["info: FF-1 WARDEN LAUNCHED 1 TORPEDO"]);
    expect(text([{ type: "torpedoLaunched", ship: "enemy", torpedo: "t", faction: "red", mode: "hot" }])).toEqual([]);
  });
});

describe("a real fight", () => {
  it("logs the start, the enemy launch, our PDCs' kills and the loss of nothing we did not lose", () => {
    const game = createGame(scenarios["pdc-test"]);
    for (let i = 0; i < 175 * 20; i++) game.update(1 / 20);
    const lines = game.alertLog.map((e) => e.text);
    expect(lines[0]).toMatch(/STARTED$/);
    expect(lines.some((l) => /^LAUNCH DETECTED: \d+ TORPEDO/.test(l))).toBe(true);
    expect(lines.some((l) => /PDCS DESTROYED \d+ TORPEDO/.test(l))).toBe(true);
    // Times only go forward.
    const times = game.alertLog.map((e) => e.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // Restarting clears it.
    game.restart();
    expect(game.alertLog.map((e) => e.text)).toHaveLength(1);
    expect(game.alertLog[0].text).toMatch(/RESTARTED$/);
  }, 60_000);
});
