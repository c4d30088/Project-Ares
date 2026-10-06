// Time and simulation-loop tunables.

export const timeTuning = {
  /** Time compression steps (DESIGN.md section 5). */
  compressionSteps: [1, 4, 16, 64, 256, 1024],
  /** If the sim takes longer than this per frame, compression steps down automatically. */
  maxSimMsPerFrame: 8,
  /** Auto-slowdown rules: drop to 1x when these happen to the player's ships. */
  slowOnFlip: true,
  slowOnOrderComplete: true,
  /** Drop to 1x when a hostile launch is detected. */
  slowOnLaunch: true,
  /** Drop to 1x when a hostile torpedo aimed at one of our ships is this close to impact
   *  (seconds); 0 turns it off. */
  slowOnThreatS: 60,
  /** Drop to 1x when hostile railgun fire is detected. */
  slowOnRailgun: true,
  /** Drop to 1x when a new enemy ship is seen (M4 Sensors Lite). */
  slowOnContact: true,
  /** Drop to 1x when one of our ships takes damage. */
  slowOnDamage: true,
  /** HULL BREACH and CREW CASUALTIES stay in the alert strip this long after it happens,
   *  real seconds (HULL BREACH stays for good below hullAlert). */
  damageAlertS: 4,
  hullAlert: 0.5,
  /** How long LAUNCH DETECTED / RAILGUN FIRE DETECTED stay in the alert strip, real seconds. */
  launchAlertS: 5,
};
