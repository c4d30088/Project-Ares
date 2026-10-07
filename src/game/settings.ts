// The player's own settings (M6 accessibility): color palette, reduced effects, volume and
// sound on or off. Saved in the browser so a playtester sets them once. Not tuning: tunables
// live in src/data and the debug panel; these are choices a player makes on the Settings screen.
//
// Browser storage can be missing or blocked (private windows, tests in Node), so every read
// and write is guarded and the game plays on the defaults without it.

import { defaultKeys, keyLabel, parseKeyMap, type ActionId, type KeyMap } from "./keymap";

export type PaletteName = "standard" | "redGreen" | "blueYellow";

export interface PlayerSettings {
  /** Color palette; changing it reloads the game (the table builds its colors once). */
  palette: PaletteName;
  /** Turns off the hit flicker, color split and dust, halves the glow, and stops pulsing
   *  and flashing. Shapes, text and colors are unchanged. */
  reduceEffects: boolean;
  /** Overall volume the player chose, 0..1 (on top of the debug panel's master volume). */
  volume: number;
  muted: boolean;
  /** The player's key for every rebindable action (see keymap.ts). */
  keys: KeyMap;
  /** Size of the HUD panels (not the table), 1 = normal. Cmd/Ctrl + and −. */
  uiScale: number;
}

export const UI_SCALE_MIN = 0.6;
export const UI_SCALE_MAX = 2;

const KEY = "ares.settings";
const PALETTES: PaletteName[] = ["standard", "redGreen", "blueYellow"];

export const defaultSettings: PlayerSettings = { palette: "standard", reduceEffects: false, volume: 1, muted: false, keys: { ...defaultKeys }, uiScale: 1 };

/** Reads saved settings, keeping only values that make sense. */
export function parseSettings(raw: string | null): PlayerSettings {
  const s = { ...defaultSettings, keys: { ...defaultKeys } };
  if (!raw) return s;
  try {
    const o = JSON.parse(raw) as Partial<PlayerSettings>;
    if (PALETTES.includes(o.palette as PaletteName)) s.palette = o.palette as PaletteName;
    if (typeof o.reduceEffects === "boolean") s.reduceEffects = o.reduceEffects;
    if (typeof o.volume === "number" && o.volume >= 0 && o.volume <= 1) s.volume = o.volume;
    if (typeof o.muted === "boolean") s.muted = o.muted;
    s.keys = parseKeyMap(o.keys);
    if (typeof o.uiScale === "number" && o.uiScale >= UI_SCALE_MIN && o.uiScale <= UI_SCALE_MAX) s.uiScale = o.uiScale;
  } catch {
    // Unreadable: defaults.
  }
  return s;
}

function load(): PlayerSettings {
  try {
    return parseSettings(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    return { ...defaultSettings, keys: { ...defaultKeys } };
  }
}

/** The live settings. Read them anywhere; change them with saveSettings. */
export const settings: PlayerSettings = load();

/** Changes settings and saves them (if the browser allows). */
export function saveSettings(next: Partial<PlayerSettings>): void {
  Object.assign(settings, next);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not saved; still applies for this session.
  }
}

/** The key shown for an action on buttons and in tooltips: "B", "SPACE", "[". */
export function hotkey(action: ActionId): string {
  return keyLabel(settings.keys[action]);
}
