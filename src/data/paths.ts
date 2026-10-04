// Predicted path tunables.

export const pathTuning = {
  burnWidthPx: 3,
  coastWidthPx: 1,
  burnOpacity: 0.1,
  coastOpacity: 0.1,
  /** Dash length as a fraction of camera distance. */
  dashScale: 0.013,
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
  /** PDC domes (to effective range): resting and while that mount fires. */
  pdcDomeOpacity: 0.003,
  pdcDomeFiringOpacity: 0.012,
  /** PDC tracer rounds (display only; kills are decided by the sim): how fast the drawn
   *  rounds fly (m/s), how many are drawn per gun per second, streak length (seconds of
   *  flight), and the faint line under the stream. */
  pdcRoundSpeed: 6000,
  pdcRoundsDrawnPerS: 14,
  pdcStreakS: 0.01,
  pdcLineOpacity: 0.05,
};
