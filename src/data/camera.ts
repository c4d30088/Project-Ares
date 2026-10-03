// Camera tunables. Distances in meters.

export const cameraTuning = {
  fovDeg: 45,
  startDistance: 32_000,
  minDistance: 10,
  maxDistance: 1e10,
  rotateSpeed: 0.6,
  zoomSpeed: 1.2,
  dampingFactor: 0.08,
};

// Placeholder grid shown in M0 so camera rotation is visible. Replaced by the holotable in M1.
export const placeholderGrid = {
  size: 20_000,
  divisions: 20,
  opacity: 0.35,
};
