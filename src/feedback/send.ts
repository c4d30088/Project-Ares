// Sending playtest feedback from the game. A note that cannot be sent right now (offline, or
// the server is not set up yet) waits in the browser and goes with the next send or the next
// visit, so nothing a tester writes is lost.

import type { Note } from "./note";

const OUTBOX = "ares.feedback.outbox";
const ENDPOINT = "/api/feedback";

function readOutbox(): Note[] {
  try {
    const raw = globalThis.localStorage?.getItem(OUTBOX);
    const list = raw ? (JSON.parse(raw) as Note[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeOutbox(list: Note[]) {
  try {
    if (list.length) globalThis.localStorage?.setItem(OUTBOX, JSON.stringify(list.slice(-50)));
    else globalThis.localStorage?.removeItem(OUTBOX);
  } catch {
    // Storage blocked: nothing more can be done.
  }
}

/** Notes written but not yet delivered. */
export function waitingCount(): number {
  return readOutbox().length;
}

type Attempt = "sent" | "retry" | { refused: string };

async function post(note: Note): Promise<Attempt> {
  try {
    const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(note) });
    if (r.ok) return "sent";
    // Refused for what it is (too long, no tag): retrying would not help. Anything else
    // (rate limit, storage not set up, server trouble) is worth another try later.
    if (r.status === 400 || r.status === 413) return { refused: ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "refused" };
    return "retry";
  } catch {
    return "retry"; // offline
  }
}

/** Sends a note (and any that were waiting). "sent", "queued" (kept for later), or why it was
 *  refused. */
export async function sendNote(note: Note): Promise<"sent" | "queued" | { refused: string }> {
  const result = await post(note);
  if (result === "retry") {
    writeOutbox([...readOutbox(), note]);
    return "queued";
  }
  if (result === "sent") void flushOutbox();
  return result;
}

/** Tries to deliver waiting notes (on load, and after a successful send). */
export async function flushOutbox(): Promise<void> {
  const waiting = readOutbox();
  if (!waiting.length) return;
  const keep: Note[] = [];
  for (const n of waiting) if ((await post(n)) === "retry") keep.push(n);
  writeOutbox(keep);
}
