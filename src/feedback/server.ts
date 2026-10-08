// The receiving end of playtest feedback: store a note (with a spam guard), and list notes for
// the developer (password only). Written against a tiny key-value interface that Cloudflare KV
// satisfies as it is (functions/api/feedback.ts) and that the dev server fakes with a file
// (vite.config.ts), so the same rules run live, locally and in tests.

import { NOTES_PER_HOUR, validateNote, type StoredNote } from "./note";

/** The few key-value operations used; Cloudflare KV has exactly these. */
export interface KeyValue {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export interface Reply {
  status: number;
  body: unknown;
}

/** A one-way fingerprint of the sender's address, for the hourly limit only. The address
 *  itself is never stored, and the fingerprint expires with the hour. */
async function fingerprint(address: string): Promise<string> {
  const data = new TextEncoder().encode(`ares-feedback:${address}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stores one note. `address` is the sender's network address (for the spam guard only). */
export async function receiveNote(kv: KeyValue, body: unknown, address: string, now = new Date()): Promise<Reply> {
  const v = validateNote(body);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const hour = now.toISOString().slice(0, 13);
  const limitKey = `rate:${await fingerprint(address)}:${hour}`;
  const sent = Number((await kv.get(limitKey)) ?? 0);
  if (sent >= NOTES_PER_HOUR) return { status: 429, body: { error: "too many notes this hour; try again later" } };
  await kv.put(limitKey, String(sent + 1), { expirationTtl: 2 * 3600 });
  const id = `note:${now.toISOString()}:${crypto.randomUUID().slice(0, 8)}`;
  const stored: StoredNote = { ...v.note, id, receivedAt: now.toISOString() };
  await kv.put(id, JSON.stringify(stored));
  return { status: 201, body: { ok: true, id } };
}

/** Constant-time comparison, so the password cannot be guessed from response timing. */
function sameSecret(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Every note, newest first, for whoever has the password. */
export async function listNotes(kv: KeyValue, givenKey: string | null, adminKey: string | undefined): Promise<Reply> {
  if (!adminKey) return { status: 503, body: { error: "the feedback password (FEEDBACK_ADMIN_KEY) is not set up yet" } };
  if (!givenKey || !sameSecret(givenKey, adminKey)) return { status: 401, body: { error: "wrong password" } };
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: "note:", cursor });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && names.length < 5000);
  const notes: StoredNote[] = [];
  for (const name of names) {
    const raw = await kv.get(name);
    if (!raw) continue;
    try {
      notes.push(JSON.parse(raw) as StoredNote);
    } catch {
      // A damaged entry is skipped, not fatal.
    }
  }
  notes.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { status: 200, body: { notes } };
}
