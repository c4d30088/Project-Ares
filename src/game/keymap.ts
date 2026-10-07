// The key map (M6): every shortcut the player can rebind, its default key, and the lookups the
// game and the HUD use. The game's key handling and every key letter shown on a button or in a
// tooltip come from here, so a rebind shows everywhere at once. The player's changes are saved
// with the other settings (src/game/settings.ts).
//
// Keys are stored as KeyboardEvent.key values, lowercased for letters ("b", "1", "[", " ").
// Esc (cancel or close), ` (debug panel) and Enter (start on the setup screen) are fixed.

export type ActionId =
  | "burnTo" | "rendezvous" | "fastPass" | "match" | "stationKeep" | "orient" | "orbit" | "coast" | "evade" | "evasive"
  | "gCruise" | "gCombat" | "gMax"
  | "launch" | "railgun" | "pdcTarget"
  | "sensors"
  | "focus" | "topDown" | "rangeRings"
  | "pause" | "slower" | "faster" | "mute";

export interface ActionDef {
  id: ActionId;
  label: string;
  group: "Helm" | "Thrust" | "Weapons" | "View" | "Time and sound";
  key: string;
}

export const ACTIONS: ActionDef[] = [
  { id: "burnTo", label: "Burn to", group: "Helm", key: "b" },
  { id: "rendezvous", label: "Intercept", group: "Helm", key: "i" },
  { id: "fastPass", label: "Fast pass", group: "Helm", key: "p" },
  { id: "orbit", label: "Orbit", group: "Helm", key: "r" },
  { id: "match", label: "Match velocity", group: "Helm", key: "m" },
  { id: "stationKeep", label: "Station-keep", group: "Helm", key: "k" },
  { id: "orient", label: "Orient", group: "Helm", key: "o" },
  { id: "coast", label: "Coast", group: "Helm", key: "c" },
  { id: "evade", label: "Evade", group: "Helm", key: "e" },
  { id: "evasive", label: "Evasive maneuvers", group: "Helm", key: "v" },
  { id: "sensors", label: "Sensors on / off", group: "Helm", key: "s" },
  { id: "gCruise", label: "Cruise G", group: "Thrust", key: "1" },
  { id: "gCombat", label: "Combat G", group: "Thrust", key: "2" },
  { id: "gMax", label: "Max G", group: "Thrust", key: "3" },
  { id: "launch", label: "Launch torpedoes", group: "Weapons", key: "l" },
  { id: "railgun", label: "Fire railgun", group: "Weapons", key: "g" },
  { id: "pdcTarget", label: "Assign PDCs", group: "Weapons", key: "d" },
  { id: "focus", label: "Focus selection", group: "View", key: "f" },
  { id: "topDown", label: "Top-down view", group: "View", key: "t" },
  { id: "rangeRings", label: "Our range rings", group: "View", key: "w" },
  { id: "pause", label: "Pause", group: "Time and sound", key: " " },
  { id: "slower", label: "Slower", group: "Time and sound", key: "[" },
  { id: "faster", label: "Faster", group: "Time and sound", key: "]" },
  { id: "mute", label: "Sound on / off", group: "Time and sound", key: "n" },
];

export type KeyMap = Record<ActionId, string>;

export const defaultKeys: KeyMap = Object.fromEntries(ACTIONS.map((a) => [a.id, a.key])) as KeyMap;

/** Keys that keep their fixed jobs and can never be bound. */
const RESERVED = new Set(["escape", "`", "enter", "tab", "shift", "control", "alt", "meta", "capslock", "dead", "unidentified"]);

/** The stored form of a key: letters lowercased, everything else as the browser names it. */
export function normalizeKey(key: string): string {
  return key.toLowerCase();
}

/** Whether a key can be bound to an action. */
export function bindable(key: string): boolean {
  const k = normalizeKey(key);
  return k.length > 0 && !RESERVED.has(k) && !/^f\d+$/.test(k); // function keys belong to the browser
}

/** How a key is shown on buttons: "B", "1", "[", "SPACE", "↑". */
export function keyLabel(key: string): string {
  const named: Record<string, string> = {
    " ": "SPACE", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", backspace: "BKSP", delete: "DEL",
    home: "HOME", end: "END", pageup: "PGUP", pagedown: "PGDN", insert: "INS",
  };
  return named[key] ?? key.toUpperCase();
}

/** Binds `key` to `action`. If another action had that key, the two swap, so nothing is ever
 *  left without a key. Returns the new map and which action (if any) it swapped with. */
export function rebind(map: KeyMap, action: ActionId, key: string): { map: KeyMap; swappedWith: ActionId | null } {
  const k = normalizeKey(key);
  const next = { ...map };
  const holder = (Object.keys(next) as ActionId[]).find((a) => a !== action && next[a] === k) ?? null;
  if (holder) next[holder] = next[action];
  next[action] = k;
  return { map: next, swappedWith: holder };
}

/** Reads a saved key map: unknown actions dropped, missing or unusable ones back to default,
 *  and if two actions ended up on one key, both go back to their defaults. */
export function parseKeyMap(raw: unknown): KeyMap {
  const map = { ...defaultKeys };
  if (!raw || typeof raw !== "object") return map;
  for (const a of ACTIONS) {
    const v = (raw as Record<string, unknown>)[a.id];
    if (typeof v === "string" && bindable(v)) map[a.id] = normalizeKey(v);
  }
  const seen = new Map<string, ActionId>();
  for (const a of ACTIONS) {
    const other = seen.get(map[a.id]);
    if (other) {
      map[a.id] = defaultKeys[a.id];
      map[other] = defaultKeys[other];
    }
    seen.set(map[a.id], a.id);
  }
  return map;
}

/** The action bound to a pressed key, or null. Shortcuts with Cmd or Ctrl held are left to
 *  the browser (copy, zoom, reload...). */
export function actionFor(map: KeyMap, e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): ActionId | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = normalizeKey(e.key);
  return (Object.keys(map) as ActionId[]).find((a) => map[a] === k) ?? null;
}
