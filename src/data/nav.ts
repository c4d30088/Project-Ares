// Nav computer tunables. Distances in meters, speeds in m/s, times in seconds.

export const navTuning = {
  /** The main drive only fires when the bow is within this angle of the wanted direction. */
  alignToleranceDeg: 1.5,
  /** Burn to point is complete inside this distance and below this speed. */
  arriveDistance: 50,
  arriveSpeed: 0.5,
  /** How quickly sideways drift is cancelled (bigger = gentler). */
  lateralTimeConstant: 4,
  /** Velocity errors smaller than this are ignored, so the ship does not chase noise. */
  velocityDeadband: 0.05,
  /** Rendezvous stops this far short of the target, alongside it. */
  rendezvousStandoff: 5000,
  /** Station-keeping lets the ship drift this far before correcting. */
  stationHoldRadius: 1000,
  stationHoldSpeed: 1,
  /** Match velocity is complete below this relative speed. */
  matchSpeedTolerance: 0.5,
  /** Fast pass is complete once closest approach is behind the ship. */
  fastPassMaxTimeS: 6 * 3600,
};
