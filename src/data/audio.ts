// Sound tunables (M6). Every sound is made by the browser's Web Audio synth: no sound files.
// You hear your own ship and its bridge: its drive, its guns, hits on it, and the alarms for
// what our side has detected. Nothing is heard that the sensor picture does not show.

export const audioTuning = {
  /** All sound off (N). */
  muted: false,
  /** Overall volume, 0..1. */
  master: 0.7,
  /** Volume of each group, 0..1. */
  alarms: 0.7,
  weapons: 0.7,
  impacts: 0.9,
  drive: 0.5,
  /** The drive rumble is at full strength at this acceleration (g). */
  driveFullG: 6,
  /** Impact countdown beeps start when a torpedo or slug is this close to hitting us (sim seconds). */
  impactBeepS: 30,
  /** Seconds between countdown beeps at the start of the countdown, and at the very end. */
  beepSlowS: 1.1,
  beepFastS: 0.12,
  /** Shortest real-time gap between two sounds of the same kind, so a swarm does not turn into
   *  a wall of noise. Seconds. */
  pdcKillGapS: 0.09,
  hitGapS: 0.12,
  /** The launch and railgun warnings do not repeat more often than this (seconds). */
  warningGapS: 3,
};
