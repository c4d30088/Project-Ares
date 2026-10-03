// Celestial body look: solid dark fill, topographic contour lines, rim glow.

export const bodyTuning = {
  /** Contour lines across the full height range. Every fifth line is brighter. */
  contourCount: 10,
  contourOpacity: 0.55,
  rimOpacity: 0.5,
  /** Surface relief as a fraction of radius. */
  moonRoughness: 0.02,
  asteroidRoughness: 0.28,
  /** Asteroids are stretched up to this much along their axes (0 = round). */
  asteroidStretch: 0.35,
  /** Noise scale: higher = smaller bumps. */
  noiseFrequency: 1.2,
};
