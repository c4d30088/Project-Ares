// Player settings read back from the browser: only sensible values survive, anything else
// falls back to the defaults, and a broken entry never stops the game.

import { describe, expect, it } from "vitest";
import { defaultSettings, parseSettings } from "../src/game/settings";

describe("player settings", () => {
  it("nothing saved: defaults", () => {
    expect(parseSettings(null)).toEqual(defaultSettings);
  });

  it("reads back what was saved", () => {
    expect(parseSettings(JSON.stringify({ palette: "redGreen", reduceEffects: true, volume: 0.4, muted: true }))).toEqual({
      palette: "redGreen", reduceEffects: true, volume: 0.4, muted: true,
    });
  });

  it("ignores unknown palettes, out-of-range volume and junk", () => {
    expect(parseSettings(JSON.stringify({ palette: "sepia", volume: 7, reduceEffects: "yes" }))).toEqual(defaultSettings);
    expect(parseSettings("{not json")).toEqual(defaultSettings);
  });
});
