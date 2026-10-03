// Holotable tunables.

export const holotableTuning = {
  /** Higher = finer grid at the same zoom. */
  gridDensity: 0.1,
  /** Half-width of the bounding box as a fraction of camera distance. */
  boxScale: 0.32,
  /** Box half-height as a fraction of its half-width. */
  boxHeightRatio: 0.35,
  gridOpacity: 1.0,
  ringOpacity: 0.4,
  axisOpacity: 0.55,
  boxOpacity: 0.45,
  /** Target number of range rings inside the box; actual count is 1-2-5 rounded. */
  ringCount: 8,
  /** Seconds to crossfade when the ring spacing changes. */
  ringFadeTime: 0.35,
  /** Drop lines from objects to the reference plane. Dashed below the plane. */
  dropLineOpacity: 0.75,
  torpedoDropLineOpacity: 0.22,
  bodyDropLineOpacity: 0.25,
  /** Foot marker ring radius on the plane, in screen pixels. */
  footRingPx: 5,
  /** Dash length below the plane, as a fraction of camera distance. */
  dashScale: 0.006,
  /** Grid fades out over this last fraction of the box half-width. */
  edgeFade: 0.3,
};
