// UI scale (M6, owner): the HUD panels grow or shrink as a whole, the 3D table does not.
// Cmd/Ctrl + and − step it (instead of the browser's own zoom, which would scale the table
// too), Cmd/Ctrl 0 puts it back; Settings has a slider. Saved with the player's settings.

import { saveSettings, settings, UI_SCALE_MAX, UI_SCALE_MIN } from "../game/settings";

/** One press of Cmd/Ctrl + or −. */
export const UI_SCALE_STEP = 0.1;

const round = (s: number) => Math.round(s * 100) / 100;

/** Applies a UI scale to the HUD (CSS zoom, so its layout reflows to the smaller or larger
 *  space) and saves it. */
export function setUiScale(scale: number): void {
  const s = round(Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, scale)));
  saveSettings({ uiScale: s });
  applyUiScale();
}

/** Applies the saved scale (at load and after a change). */
export function applyUiScale(): void {
  const hud = document.getElementById("hud");
  if (hud) hud.style.setProperty("zoom", String(settings.uiScale));
  document.documentElement.style.setProperty("--ui-scale", String(settings.uiScale));
  // The deck refits to the new space.
  window.dispatchEvent(new Event("resize"));
}

/** Handles Cmd/Ctrl + / − / 0. Returns true if the key press was a UI scale change. */
export function uiScaleKey(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  if (e.key === "=" || e.key === "+") setUiScale(settings.uiScale + UI_SCALE_STEP);
  else if (e.key === "-" || e.key === "_") setUiScale(settings.uiScale - UI_SCALE_STEP);
  else if (e.key === "0") setUiScale(1);
  else return false;
  e.preventDefault(); // not the browser's zoom, which would scale the table too
  return true;
}
