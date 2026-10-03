// Camera tunables. Distances in meters, angles in degrees.

export const cameraTuning = {
  fovDeg: 50,
  startDistance: 10_000_000,
  startYawDeg: -60,
  startPitchDeg: 32,
  minDistance: 100,
  maxDistance: 2e10,
  /** Degrees of rotation per pixel dragged. */
  rotateSpeed: 0.4,
  /** Zoom per wheel step; higher is faster. */
  zoomSpeed: 1.2,
  /** Fraction of the remaining motion covered per 60 Hz frame. Lower is smoother. */
  dampingFactor: 0.2,
  /** Pitch used by the top-down snap (T). */
  topDownPitchDeg: 89.9,
};
