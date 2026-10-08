// Playtest feedback (M6): what a note is, and the checks every note passes before it is
// stored. Shared by the game (which sends notes), the Cloudflare Worker that stores them
// (worker/index.ts) and the local stand-in used by the dev server, so all three
// agree. Plain TypeScript, no DOM: it runs in the browser, on Cloudflare and in Node.
//
// A note carries only what the tester chose to send: their gamer tag, quick tags, their words,
// and game details (map, result, fight time, build, screen size, display settings). No name,
// no email.

export const CATEGORIES = ["confusing", "bug", "great", "wrong", "idea"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  confusing: "Confusing",
  bug: "Bug",
  great: "Felt great",
  wrong: "Felt wrong",
  idea: "Idea",
};

/** Game details sent with a note, so the developer knows what the tester was looking at. */
export interface NoteContext {
  /** Which build (the stamp on the setup screen). */
  build: string;
  /** "skirmish: open-duel 1v1 duelist", "scenario: first-fight", or "setup screen". */
  where: string;
  /** Sim seconds into the fight, if in one. */
  fightTimeS?: number;
  /** VICTORY, DEFEAT, DRAW, if the fight had ended. */
  result?: string;
  /** Watching a replay when writing. */
  replay?: boolean;
  /** Window size, and the display settings that change what the screen looks like. */
  screen: string;
  display: string;
}

export interface Note {
  gamerTag: string;
  categories: Category[];
  text: string;
  context: NoteContext;
  /** When the tester wrote it (their clock), ISO time. */
  writtenAt: string;
  /** Asked for after a fight (the result banner), or written on the tester's own initiative. */
  prompted: boolean;
}

export const LIMITS = { gamerTag: 24, text: 2000, contextField: 120 };

/** A gamer tag: 2 to 24 letters, digits, spaces, and _ - . (no addresses, no markup). */
export function cleanGamerTag(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length < 2 || t.length > LIMITS.gamerTag) return null;
  return /^[\p{L}\p{N} _.-]+$/u.test(t) ? t : null;
}

const str = (v: unknown, max: number): string | null => (typeof v === "string" ? v.slice(0, max) : null);

/** Checks a note as received (from the network: anything at all) and returns a clean copy,
 *  or why it was refused. */
export function validateNote(raw: unknown): { ok: true; note: Note } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "not a note" };
  const o = raw as Record<string, unknown>;
  const gamerTag = typeof o.gamerTag === "string" ? cleanGamerTag(o.gamerTag) : null;
  if (!gamerTag) return { ok: false, error: "gamer tag missing or not allowed" };
  const categories = Array.isArray(o.categories) ? [...new Set(o.categories.filter((c): c is Category => CATEGORIES.includes(c as Category)))] : [];
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (text.length > LIMITS.text) return { ok: false, error: `text longer than ${LIMITS.text} characters` };
  if (!text && categories.length === 0) return { ok: false, error: "empty note" };
  const c = (o.context && typeof o.context === "object" ? o.context : {}) as Record<string, unknown>;
  const max = LIMITS.contextField;
  const context: NoteContext = {
    build: str(c.build, max) ?? "unknown",
    where: str(c.where, max) ?? "unknown",
    screen: str(c.screen, max) ?? "unknown",
    display: str(c.display, max) ?? "unknown",
  };
  if (typeof c.fightTimeS === "number" && Number.isFinite(c.fightTimeS) && c.fightTimeS >= 0) context.fightTimeS = Math.round(c.fightTimeS);
  const result = str(c.result, 20);
  if (result) context.result = result;
  if (c.replay === true) context.replay = true;
  const writtenAt = typeof o.writtenAt === "string" && !Number.isNaN(Date.parse(o.writtenAt)) ? new Date(o.writtenAt).toISOString() : new Date().toISOString();
  return { ok: true, note: { gamerTag, categories, text, context, writtenAt, prompted: o.prompted === true } };
}

/** A stored note: as sent, plus when the server received it. */
export interface StoredNote extends Note {
  id: string;
  receivedAt: string;
}

/** Notes a single tester may send per hour (spam guard on the public endpoint). */
export const NOTES_PER_HOUR = 30;
