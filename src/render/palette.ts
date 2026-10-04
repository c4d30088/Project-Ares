// Color tokens. See docs/DESIGN.md section 12.
// Red (hostile, threat) means danger and is never decorative.
// Uncertain or warning: orange on the 3D table (uncertainMap), amber in the HUD panels.
// Weapons once fired: green for ours, yellow for the enemy's. Neutral is white.

export const palette = {
  bg: "#05080C",
  grid: "#1E4A5A",
  friendly: "#39C6FF",
  neutral: "#F2F5F7",
  hostile: "#FF3344",
  threat: "#FF5A4A",
  /** HUD panels: warnings and uncertain values. */
  uncertain: "#FFB020",
  /** The 3D table: unknown and uncertain contacts, warnings on placed points. */
  uncertainMap: "#FF7A1A",
  /** Weapons once fired (PDC fire, torpedo intercept lines and impact marks). */
  fireFriendly: "#3DF56B",
  fireHostile: "#FFE433",
  chrome: "#7C93A0",
  text: "#DCE6EA",
  textDim: "#8A9BA4",
  panelBg: "#05080C",
} as const;

export type PaletteToken = keyof typeof palette;
