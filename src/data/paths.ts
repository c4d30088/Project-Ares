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
  /** Budget per frame while a new order's route is first computed. */
  freshBudgetMs: 12,
  /** Re-run predictions this often (real seconds) to absorb drift and target moves. */
  refreshS: 2,
  /** Torpedo intercept lines: thin, so a salvo reads as converging threads. */
  interceptWidthPx: 1,
  interceptOpacity: 0.1,
  /** Dot length of the intercept lines, as a fraction of camera distance (gap is 1.5x). */
  interceptDotScale: 0.003,
  /** Torpedo paths: re-run this often (real seconds), within this time budget per frame
   *  (milliseconds), at most this far ahead (sim seconds). */
  torpedoRefreshS: 1,
  torpedoBudgetMs: 3,
  torpedoMaxPredictS: 1800,
  /** Weapon range rings on the reference plane. */
  rangeRingWidthPx: 1.5,
  rangeRingOpacity: 0.6,
};
