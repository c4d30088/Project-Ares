// Post-processing and atmosphere tunables. Every effect has an intensity control
// (DESIGN.md section 12: readability first).

export const effectsTuning = {
  enabled: true,
  bloomStrength: 0.55,
  bloomRadius: 0.3,
  bloomThreshold: 0.12,
  /** Constant horizontal red/blue split, in pixels. */
  chromaticPx: 0.7,
  /** Extra split toward the screen edges, in pixels at the corners. */
  chromaticRadialPx: 1.2,
  /** Faint floating dust for depth. 0 hides it. */
  dustOpacity: 0.35,
};
