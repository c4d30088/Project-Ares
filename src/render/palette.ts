// Color tokens. See docs/DESIGN.md section 12.
// Red (hostile, threat) means danger and is never decorative.
// Amber (uncertain) means uncertain or warning.

export const palette = {
  bg: "#05080C",
  grid: "#1E4A5A",
  friendly: "#39C6FF",
  neutral: "#4BE39A",
  hostile: "#FF3344",
  threat: "#FF5A4A",
  uncertain: "#FFB020",
  chrome: "#7C93A0",
  text: "#DCE6EA",
} as const;

export type PaletteToken = keyof typeof palette;
