// The feedback endpoint's rules: notes are stored, spam is limited per sender per hour, the
// sender's address is never stored, and only the password holder can list notes.

import { describe, expect, it } from "vitest";
import { listNotes, receiveNote, type KeyValue } from "../src/feedback/server";
import { NOTES_PER_HOUR } from "../src/feedback/note";

function fakeKv(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(k) {
      return data.get(k) ?? null;
    },
    async put(k, v) {
      data.set(k, v);
    },
    async list({ prefix }) {
      return { keys: [...data.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })), list_complete: true };
    },
  };
}

const note = (text: string) => ({ gamerTag: "Nova", categories: ["idea"], text, context: { build: "b", where: "w", screen: "s", display: "d" } });

describe("feedback endpoint", () => {
  it("stores a note and lists it, newest first, for the password holder", async () => {
    const kv = fakeKv();
    expect((await receiveNote(kv, note("first"), "1.2.3.4", new Date("2026-10-07T10:00:00Z"))).status).toBe(201);
    expect((await receiveNote(kv, note("second"), "1.2.3.4", new Date("2026-10-07T10:05:00Z"))).status).toBe(201);
    const r = await listNotes(kv, "hunter2-long-password", "hunter2-long-password");
    expect(r.status).toBe(200);
    const notes = (r.body as { notes: { text: string; gamerTag: string }[] }).notes;
    expect(notes.map((n) => n.text)).toEqual(["second", "first"]);
    expect(notes[0].gamerTag).toBe("Nova");
  });

  it("refuses bad notes", async () => {
    const kv = fakeKv();
    expect((await receiveNote(kv, { gamerTag: "", text: "x" }, "1.2.3.4")).status).toBe(400);
    expect([...kv.data.keys()].filter((k) => k.startsWith("note:"))).toEqual([]);
  });

  it("limits notes per sender per hour, and never stores the address", async () => {
    const kv = fakeKv();
    const t = new Date("2026-10-07T10:00:00Z");
    for (let i = 0; i < NOTES_PER_HOUR; i++) expect((await receiveNote(kv, note(`n${i}`), "9.9.9.9", t)).status).toBe(201);
    expect((await receiveNote(kv, note("one too many"), "9.9.9.9", t)).status).toBe(429);
    // Someone else is not affected, and the next hour starts fresh.
    expect((await receiveNote(kv, note("other"), "8.8.8.8", t)).status).toBe(201);
    expect((await receiveNote(kv, note("later"), "9.9.9.9", new Date("2026-10-07T11:00:00Z"))).status).toBe(201);
    for (const [k, v] of kv.data) {
      expect(k).not.toContain("9.9.9.9");
      expect(v).not.toContain("9.9.9.9");
    }
  });

  it("listing needs the right password, and a password must be set up", async () => {
    const kv = fakeKv();
    expect((await listNotes(kv, "guess", "the-real-one")).status).toBe(401);
    expect((await listNotes(kv, null, "the-real-one")).status).toBe(401);
    expect((await listNotes(kv, "anything", undefined)).status).toBe(503);
  });
});
