// Time and simulation-loop tunables.

export const timeTuning = {
  /** Time compression steps (DESIGN.md section 5). */
  compressionSteps: [1, 4, 16, 64, 256, 1024],
  /** If the sim takes longer than this per frame, compression steps down automatically. */
  maxSimMsPerFrame: 8,
  /** Auto-slowdown rules: drop to 1x when these happen to the player's ships. */
  slowOnFlip: true,
  slowOnOrderComplete: true,
};
