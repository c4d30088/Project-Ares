// Nav computer tunables. Distances in meters, speeds in m/s, times in seconds.

export const navTuning = {
  /** The main drive only fires when the bow is within this angle of the wanted direction. */
  alignToleranceDeg: 1.5,
  /** Burn to point is complete inside this distance and below this speed. */
  arriveDistance: 50,
  arriveSpeed: 0.5,
  /** How quickly sideways drift is cancelled (bigger = gentler). */
  lateralTimeConstant: 4,
  /** While accelerating, sideways correction may use at most this fraction of thrust. */
  lateralShare: 0.6,
  /** Velocity errors smaller than this are ignored, so the ship does not chase noise. */
  velocityDeadband: 0.05,
  /** Rendezvous stops this far short of the target, alongside it. */
  rendezvousStandoff: 5000,
  /** Rendezvous is complete inside this distance of the standoff point and below this
   *  relative speed. */
  rendezvousArriveDistance: 200,
  rendezvousArriveSpeed: 1,
  /** Station-keeping lets the ship drift this far before correcting. */
  stationHoldRadius: 1000,
  stationHoldSpeed: 1,
  /** Match velocity is complete below this relative speed. */
  matchSpeedTolerance: 0.5,
  /** Safety zone around bodies: the larger of the body's hard limit (its surface plus a
   *  little) and its gravity point of no return, where the pull reaches 1/noReturnMargin
   *  of the ship's Cruise acceleration. Low-gravity asteroids can be approached closely;
   *  heavy bodies push the zone out. */
  noReturnMargin: 2,
  /** Hard limit: surface plus this fraction of radius plus bodyHardMarginMeters. Asteroids
   *  are lumpy, so theirs covers the bumpiest drawn surface; moons are nearly round. */
  asteroidHardMarginFraction: 0.3,
  roundBodyHardMarginFraction: 0.05,
  bodyHardMarginMeters: 1000,
  /** Routes around a body pass this multiple of its zone radius, for a little margin. */
  routeClearanceFactor: 1.02,
  /** A detour aims at most this far around the body at once (degrees of arc), so a ship
   *  leaving the zone edge sets off along the edge instead of toward a far-off point. */
  detourMaxArcDeg: 90,
  /** Body avoidance, the last line of defence: whatever the order, if the ship's motion is
   *  about to carry it inside a body's hard limit (plus this margin) with no way left to
   *  swerve, the nav computer takes over and swerves at full thrust. */
  avoidMarginFraction: 0.02,
  avoidMarginMeters: 300,
  /** How far ahead avoidance looks, beyond the time to stop: seconds. */
  avoidLookaheadExtraS: 30,
  /** Orbit radius as a multiple of the body's safety zone for this ship. */
  orbitRadiusFactor: 1.15,
  /** How quickly orbit corrections act, seconds; and how gently radius / plane errors are
   *  steered out, as a fraction of the orbit's angular rate (gentle = no wobble). */
  orbitTimeConstant: 5,
  orbitRadialGain: 0.5,
  /** Holding ships burn to hover against gravity only if it is stronger than this, m/s². */
  hoverMinAccel: 0.01,
  /** Fast pass is complete once closest approach is behind the ship. */
  fastPassMaxTimeS: 6 * 3600,
};
