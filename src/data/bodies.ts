// Celestial body look: solid dark fill, topographic contour lines, rim glow.

export const bodyTuning = {
  /** Contour lines across the full height range. Every fifth line is brighter. */
  contourCount: 8,
  contourOpacity: 0.12,
  rimOpacity: 0.18,
  /** Surface relief as a fraction of radius. */
  moonRoughness: 0.045,
  asteroidRoughness: 0.22,
  /** Asteroids are stretched up to this much along their axes (0 = round). */
  asteroidStretch: 0.35,
  /** Noise scale: higher = smaller bumps. */
  noiseFrequency: 2,
};
