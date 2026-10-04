// Post-processing and atmosphere tunables. Every effect has an intensity control
// (DESIGN.md section 12: readability first).

export const effectsTuning = {
  enabled: true,
  bloomStrength: 0.1,
  bloomRadius: 0.15,
  bloomThreshold: 0.02,
  /** Constant horizontal red/blue split, in pixels. */
  chromaticPx: 0.25,
  /** Extra split toward the screen edges, in pixels at the corners. */
  chromaticRadialPx: 0.1,
  /** Faint floating dust for depth. 0 hides it. */
  dustOpacity: 0.27,
};
