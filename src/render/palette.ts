// Color tokens. See docs/DESIGN.md section 12.
//
// Three palettes with the same meanings (M6 accessibility): standard, red-green safe (the most
// common color blindness) and blue-yellow safe. Only the shades change; tests/palette.test.ts
// simulates each kind of color blindness and checks that every pair that must look different
// (hostile vs ours, our fire vs theirs, hostile vs lost contact...) stays clearly apart.
// The player's choice is read once at load; changing it reloads the game.
// Red (hostile, threat) means danger and is never decorative.
// Uncertain or warning: orange on the 3D table (uncertainMap), amber in the HUD panels.
// Weapons once fired (torpedoes in flight, PDC fire, slugs, impact effects): green for ours,
// yellow for the enemy's. Neutral is white.

import { settings, type PaletteName } from "../game/settings";

const standard = {
  bg: "#05080C",
  grid: "#1E4A5A",
  friendly: "#39C6FF",
  neutral: "#F2F5F7",
  hostile: "#FF3344",
  /** Danger text in the HUD panels (torpedo symbols use the weapon-fire colors). */
  threat: "#FF5A4A",
  /** HUD panels: warnings and uncertain values. */
  uncertain: "#FFB020",
  /** The 3D table: unknown and uncertain contacts, warnings on placed points. */
  uncertainMap: "#FF7A1A",
  /** Weapons once fired (torpedoes in flight, PDC fire, intercept lines, impact marks). */
  fireFriendly: "#3DF56B",
  fireHostile: "#FFE433",
  chrome: "#7C93A0",
  text: "#DCE6EA",
  textDim: "#8A9BA4",
  panelBg: "#05080C",
};

export type PaletteToken = keyof typeof standard;
export type Palette = Record<PaletteToken, string>;

export const palettes: Record<PaletteName, Palette> = {
  standard,
  // Red-green safe: hostile toward pink, our ships a lighter blue, enemy fire pure yellow,
  // lost contacts a deeper orange; every key pair stays apart for protan and deutan vision.
  redGreen: {
    ...standard,
    friendly: "#668CFF",
    hostile: "#F25A9D",
    threat: "#FF45A6",
    uncertainMap: "#EB6C0D",
    uncertain: "#E27303",
    fireFriendly: "#57FF8F",
    fireHostile: "#FEFF02",
  },
  // Blue-yellow safe: our ships a deeper blue (apart from our green fire), enemy fire a
  // softer gold (apart from white), warnings shifted so they stay apart from hostile red.
  blueYellow: {
    ...standard,
    friendly: "#688FFD",
    hostile: "#FF4D3D",
    threat: "#F15D50",
    uncertainMap: "#ED841A",
    uncertain: "#F1A40B",
    fireFriendly: "#3AFF7B",
    fireHostile: "#F2D563",
  },
};

export const paletteNames: Record<PaletteName, string> = {
  standard: "Standard",
  redGreen: "Red-green safe",
  blueYellow: "Blue-yellow safe",
};

/** A palette named in the page address (?palette=redGreen), for screenshots; not saved. */
function paletteFromAddress(): PaletteName | null {
  const name = new URLSearchParams(globalThis.location?.search ?? "").get("palette");
  return name && name in palettes ? (name as PaletteName) : null;
}

/** The colors in use: the player's chosen palette, fixed for this page load. */
export const palette: Readonly<Palette> = { ...palettes[paletteFromAddress() ?? settings.palette] };
