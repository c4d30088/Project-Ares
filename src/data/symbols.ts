// Symbol tunables. Sizes are on-screen quad sizes in CSS pixels; the drawn symbol fills
// about two thirds of its quad (the rest is room for brackets).

export const symbolTuning = {
  size: {
    corvette: 30,
    frigate: 34,
    destroyer: 36,
    cruiser: 40,
    capital: 50,
    station: 44,
    unknown: 36,
    torpedo: 24,
  },
  /** Global multiplier on all symbol sizes. */
  scale: 1,
  /** Hostile torpedoes pulse at this rate (Hz) between pulseMin and full brightness. */
  torpedoPulseHz: 2.7,
  pulseMin: 0.32,
  /** A body smaller than this on screen (radius, px) is drawn as a marker instead. */
  bodyMarkerBelowPx: 7,
  bodyMarkerSize: 22,
  bodyOpacity: 0.25,
  labelOpacity: 0.75,
  /** Click within this many pixels of a symbol to select it. */
  pickRadiusPx: 14,
};
