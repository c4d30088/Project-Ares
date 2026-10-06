// Sensors Lite tunables (ROADMAP M4, owner 2026-10-05). One Sensors switch per ship.
// A ship sees a contact when there is line of sight and any one of these holds:
//   the contact is loud (drive burning, Sensors on, or just fired), at any range;
//   the contact is within the proximity range;
//   the observer has Sensors on and the contact is within the sensor range.
// Distances are meters, times seconds.

export const sensorTuning = {
  /** Anything this close is always seen (line of sight still needed). */
  proximityRange: 1_000_000,
  /** With Sensors on, dark ships and cold torpedoes are found this far out. */
  sensorRange: 3_000_000,
  /** A ship stays loud this long after its drive stops (a flip mid-route does not hide it). */
  plumeFadeS: 15,
  /** A ship stays loud this long after firing a weapon (hot torpedo launch, railgun, PDC). */
  firedLoudS: 10,
  /** A contact nobody sees any more is still followed along its last motion for this long,
   *  then marked lost (avoids flicker at the edge of a range). */
  lostAfterS: 2,
  /** A lost contact's marker fades out over this long, then is dropped. */
  lostFadeS: 300,
  /** Ships start with Sensors off unless the scenario says otherwise. */
  startSensorsOn: false,
};
