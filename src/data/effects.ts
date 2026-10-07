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
  /** Hit flicker (M6): how hard the table stutters when our ship is hit, 0..1 (0 off). */
  hitFlicker: 0.7,
  /** How long the flicker lasts after a hit, seconds. */
  hitFlickerS: 0.7,
  /** Flicker for PDC rounds striking us, and the least a heavy hit gives, 0..1. */
  hitFlickerPdc: 0.25,
  hitFlickerMin: 0.5,
  /** A heavy hit flickers harder by this much per whole hull lost (0.2 of the hull adds 0.2 x this). */
  hitFlickerPerHull: 2.5,
  /** Alert strip animations (M6): new alerts flash in, danger alerts pulse, 0..1 (0 off). */
  alertAnim: 1,
};
