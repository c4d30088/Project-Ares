// Playtest feedback notes: only what the tester chose to send gets through, within limits.

import { describe, expect, it } from "vitest";
import { cleanGamerTag, LIMITS, validateNote } from "../src/feedback/note";

const good = {
  gamerTag: "  Nova_7 ",
  categories: ["confusing", "bug", "confusing", "nonsense"],
  text: "  Could not find how to fire.  ",
  context: { build: "abc1234 · 2026-10-07", where: "skirmish: open-duel 1v1 duelist", fightTimeS: 312.6, result: "DEFEAT", screen: "1440x900", display: "standard" },
  writtenAt: "2026-10-07T12:00:00Z",
  prompted: true,
};

describe("feedback notes", () => {
  it("accepts a normal note and cleans it", () => {
    const r = validateNote(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.note.gamerTag).toBe("Nova_7");
    expect(r.note.categories).toEqual(["confusing", "bug"]);
    expect(r.note.text).toBe("Could not find how to fire.");
    expect(r.note.context.fightTimeS).toBe(313);
    expect(r.note.prompted).toBe(true);
  });

  it("gamer tags: short names with letters, digits and a few marks only", () => {
    expect(cleanGamerTag("Ace")).toBe("Ace");
    expect(cleanGamerTag("Zoë 99")).toBe("Zoë 99");
    expect(cleanGamerTag("x")).toBeNull();
    expect(cleanGamerTag("a".repeat(LIMITS.gamerTag + 1))).toBeNull();
    expect(cleanGamerTag("me@example.com")).toBeNull();
    expect(cleanGamerTag("<script>")).toBeNull();
  });

  it("refuses notes without a tag, empty notes and very long ones", () => {
    expect(validateNote({ ...good, gamerTag: "" }).ok).toBe(false);
    expect(validateNote({ ...good, categories: [], text: "   " }).ok).toBe(false);
    expect(validateNote({ ...good, text: "x".repeat(LIMITS.text + 1) }).ok).toBe(false);
    expect(validateNote(null).ok).toBe(false);
    expect(validateNote("hello").ok).toBe(false);
  });

  it("a quick tag alone is a note", () => {
    expect(validateNote({ ...good, text: "", categories: ["great"] }).ok).toBe(true);
  });

  it("keeps game details short and drops anything unexpected", () => {
    const r = validateNote({ ...good, context: { ...good.context, where: "w".repeat(500), secret: "x", fightTimeS: -5 }, extra: "y" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.note.context.where.length).toBe(LIMITS.contextField);
    expect(r.note.context.fightTimeS).toBeUndefined();
    expect(Object.keys(r.note.context)).not.toContain("secret");
    expect(Object.keys(r.note)).not.toContain("extra");
  });
});
