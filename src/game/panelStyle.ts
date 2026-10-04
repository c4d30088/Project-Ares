// Look of the debug panel itself: type size, explanation size, width and font. These are
// not game tunables, so they live here (not in src/data) and are remembered in the browser,
// because switching scenario reloads the page.

import type GUI from "lil-gui";

export const panelStyle = {
  /** Size of control names and values, in px. */
  textPx: 11,
  /** Size of the explanation line under each control, in px. */
  notePx: 10,
  /** Panel width, in px. */
  widthPx: 340,
  /** "panel" (the panel's own sans), "game" (the HUD font) or "mono". */
  font: "panel",
};

export const panelFonts: Record<string, string> = {
  panel: "",
  game: '"Oxanium", sans-serif',
  mono: '"Share Tech Mono", ui-monospace, monospace',
};

const KEY = "ares.panelStyle";
const defaults = { ...panelStyle };

export function loadPanelStyle(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<typeof panelStyle>;
    for (const k of Object.keys(defaults) as (keyof typeof panelStyle)[]) {
      if (typeof saved[k] === typeof defaults[k]) (panelStyle as Record<string, unknown>)[k] = saved[k];
    }
  } catch {
    // No saved style, or storage is blocked: keep the defaults.
  }
}

export function resetPanelStyle(): void {
  Object.assign(panelStyle, defaults);
}

/** Pushes the current style onto the panel as CSS variables, and remembers it. */
export function applyPanelStyle(gui: GUI): void {
  if (typeof document === "undefined") return;
  const s = panelStyle;
  // Rows grow with the text so bigger type is not cramped.
  const rowPx = Math.max(20, Math.round(s.textPx * 1.9));
  const family = panelFonts[s.font] ?? "";
  // Every folder re-declares lil-gui's size variables, so each one gets the values.
  for (const g of [gui, ...gui.foldersRecursive()]) {
    const el = g.domElement;
    el.style.setProperty("--font-size", `${s.textPx}px`);
    el.style.setProperty("--input-font-size", `${s.textPx}px`);
    el.style.setProperty("--widget-height", `${rowPx}px`);
    el.style.setProperty("--ares-note-size", `${s.notePx}px`);
    for (const v of ["--font-family", "--font-family-mono"]) {
      if (family) el.style.setProperty(v, family);
      else el.style.removeProperty(v);
    }
  }
  gui.domElement.style.setProperty("--width", `${s.widthPx}px`);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the style just will not survive a reload.
  }
}
