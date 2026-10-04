// Holotable tunables.

export const holotableTuning = {
  /** Higher = finer grid at the same zoom. */
  gridDensity: 0.2,
  /** Half-width of the bounding box as a fraction of camera distance. */
  boxScale: 0.5,
  /** Box half-height as a fraction of its half-width. */
  boxHeightRatio: 0.65,
  gridOpacity: 0.3,
  ringOpacity: 0.11,
  axisOpacity: 0.1,
  boxOpacity: 0.23,
  /** Target number of range rings inside the box; actual count is 1-2-5 rounded. */
  ringCount: 6,
  /** Seconds to crossfade when the ring spacing changes. */
  ringFadeTime: 0.35,
  /** Drop lines from objects to the reference plane. Dashed below the plane. */
  dropLineOpacity: 0.6,
  torpedoDropLineOpacity: 0.06,
  bodyDropLineOpacity: 0.5,
  /** Foot marker ring radius on the plane, in screen pixels. */
  footRingPx: 6,
  /** Dash length below the plane, as a fraction of camera distance. */
  dashScale: 0.007,
  /** Grid fades out over this last fraction of the box half-width. */
  edgeFade: 0.67,
};
