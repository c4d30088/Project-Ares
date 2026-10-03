// Weapon tunables. DESIGN.md section 7 gives the starting torpedo numbers.

export const torpedoTuning = {
  accelG: 30,
  /** Total delta-v budget, m/s. */
  deltaV: 15_000,
  /** Part of the budget saved for final homing corrections, m/s. */
  terminalReserve: 3_000,
  /** Final homing starts this many seconds before impact. */
  terminalPhaseS: 30,
  /** Detonates when it passes within this distance of a hostile ship, m. */
  fuseRadius: 100,
  /** Seeker range for point-targeted torpedoes and lost targets, m. Perfect info until M4. */
  seekerRange: 2_000_000,
  /** A point-targeted torpedo switches to its seeker this far from the point, m. */
  pointArrival: 50_000,
  /** A torpedo that finds nothing waits as a mine this long, then self-destructs, s. */
  mineLifetimeS: 3_600,
  /** Cold launch: pushed out at this speed, drive lights this far from the target. */
  coldEjectSpeed: 30,
  coldIgnitionDistance: 2_000_000,
  /** Hot launch push-out speed, m/s (sideways, to clear the tubes). */
  hotEjectSpeed: 15,
  /** Seconds for a tube to reload. */
  tubeReloadS: 12,
};
