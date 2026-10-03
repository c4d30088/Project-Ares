// Predicted path tunables.

export const pathTuning = {
  burnWidthPx: 2,
  coastWidthPx: 1.5,
  burnOpacity: 0.95,
  coastOpacity: 0.7,
  /** Dash length as a fraction of camera distance. */
  dashScale: 0.008,
  /** Predict at most this far ahead, seconds of sim time. */
  maxPredictS: 6 * 3600,
  /** Time budget per frame for running predictions, milliseconds. */
  budgetMs: 3,
  /** Re-run predictions this often (real seconds) to absorb drift and target moves. */
  refreshS: 2,
};
