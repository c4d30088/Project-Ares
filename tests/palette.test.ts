// The color palettes keep their meanings apart for the eyes they are made for. Each palette is
// seen through a simulation of a kind of color blindness (Machado, Oliveira and Fernandes 2009,
// full severity), and every pair of colors that must look different has to stay at least a set
// distance apart in perceived color (CIE Lab).

import { describe, expect, it } from "vitest";
import { palettes, type Palette, type PaletteToken } from "../src/render/palette";

const VISION = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
type Vision = keyof typeof VISION;

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab([r, g, b]: number[]): number[] {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function seen(hex: string, v: Vision): number[] {
  const c = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return lab(VISION[v].map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))));
}
const distance = (p: Palette, a: PaletteToken, b: PaletteToken, v: Vision) => {
  const x = seen(p[a], v), y = seen(p[b], v);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Pairs that mean different things where they meet on the table or in the HUD. */
const MUST_DIFFER: [PaletteToken, PaletteToken][] = [
  ["friendly", "hostile"], ["fireFriendly", "fireHostile"], ["hostile", "uncertainMap"], ["hostile", "fireHostile"],
  ["friendly", "fireFriendly"], ["uncertain", "threat"], ["fireHostile", "uncertainMap"], ["threat", "fireFriendly"],
  ["neutral", "fireHostile"], ["neutral", "friendly"], ["fireFriendly", "uncertainMap"], ["hostile", "fireFriendly"],
];

function weakest(p: Palette, visions: Vision[]) {
  let worst = { d: Infinity, pair: "", vision: "" };
  for (const v of visions) {
    for (const [a, b] of MUST_DIFFER) {
      const d = distance(p, a, b, v);
      if (d < worst.d) worst = { d, pair: `${a}/${b}`, vision: v };
    }
  }
  return worst;
}

describe("color palettes", () => {
  it("standard: every pair clearly apart in normal vision", () => {
    expect(weakest(palettes.standard, ["normal"]).d).toBeGreaterThan(35);
  });

  it("red-green safe: clearly apart in normal, protan and deutan vision", () => {
    const w = weakest(palettes.redGreen, ["normal", "protan", "deutan"]);
    expect(w.d, `${w.pair} in ${w.vision}`).toBeGreaterThan(35);
  });

  it("blue-yellow safe: apart in normal and tritan vision, better than standard", () => {
    const w = weakest(palettes.blueYellow, ["normal", "tritan"]);
    expect(w.d, `${w.pair} in ${w.vision}`).toBeGreaterThan(25);
    expect(w.d).toBeGreaterThan(weakest(palettes.standard, ["tritan"]).d);
  });

  it("the safe palettes really help where standard is weak", () => {
    expect(weakest(palettes.standard, ["deutan"]).d).toBeLessThan(25);
    expect(weakest(palettes.redGreen, ["deutan"]).d).toBeGreaterThan(weakest(palettes.standard, ["deutan"]).d + 15);
  });

  it("every palette color reads on the near-black table", () => {
    for (const p of Object.values(palettes)) {
      for (const k of ["friendly", "hostile", "threat", "uncertain", "uncertainMap", "fireFriendly", "fireHostile", "neutral"] as PaletteToken[]) {
        expect(seen(p[k], "normal")[0], k).toBeGreaterThan(55);
      }
    }
  });

  it("only the meaning colors change; panels, text and chrome stay the same", () => {
    for (const p of Object.values(palettes)) {
      for (const k of ["bg", "grid", "chrome", "text", "textDim", "panelBg"] as PaletteToken[]) expect(p[k]).toBe(palettes.standard[k]);
    }
  });
});
