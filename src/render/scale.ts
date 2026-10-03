// Scale levels for the zoom-adaptive holotable grid.
// The grid uses power-of-ten spacings. As the camera zooms out, the finest level fades
// away and the next level takes over, so the grid never pops.

export interface GridLevels {
  /** Finest spacing in meters (a power of ten). Levels i = 0, 1, 2 have spacing base * 10^i. */
  base: number;
  /** 0..1: how far the view is through the current decade. */
  t: number;
}

export function gridLevels(cameraDistance: number, density: number): GridLevels {
  const L = Math.log10(Math.max(1e-9, cameraDistance * density));
  const f = Math.floor(L);
  return { base: Math.pow(10, f), t: L - f };
}

/** Line strength for grid level i (0, 1, 2). Continuous across decade changes. */
export function gridStrength(i: number, t: number): number {
  return Math.min(1, Math.max(0, 0.5 + 0.5 * (i - t)));
}

/** Range ring strength for level i (1, 2). Level 1 fades out fully before the decade changes. */
export function ringStrength(i: number, t: number): number {
  return Math.min(1, Math.max(0, i - t));
}

/** Smallest value in the 1-2-5 sequence (…, 0.5, 1, 2, 5, 10, 20, …) that is >= x. */
export function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  const nice = m <= 1 + 1e-9 ? 1 : m <= 2 + 1e-9 ? 2 : m <= 5 + 1e-9 ? 5 : 10;
  return nice * p;
}
