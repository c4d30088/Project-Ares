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
  /** Hot salvos bigger than the tubes: the first torpedoes out wait beside the ship, drive
   *  dark, until the last is out, then all light together and arrive as one wave. Off: each
   *  wave of tubes lights as it leaves (12 s apart). Under evaluation (M3 step 7). */
  salvoHold: false,
  /** Range ring shown while aiming torpedoes, m: about where a single torpedo still hits a
   *  ship burning hard (Combat G) across its path the whole way. Display only. */
  effectiveRange: 3_000_000,
};

// PDCs (DESIGN.md section 7). Arcs per mount come from the class loadout (combat.ts).
export const pdcTuning = {
  /** Kill chance builds up at this rate (per second of fire on one target) inside
   *  effective range, falling linearly to nothing at maximum range. */
  killRatePerS: 0.8,
  effectiveRange: 15_000,
  maxRange: 50_000,
  /** Seconds to swing onto a new target. Damage makes it slower. */
  switchS: 0.3,
  /** Rounds in each mount's magazine, and how fast it fires them. */
  roundsPerMount: 3000,
  roundsPerS: 50,
  /** Burst fire for Auto (the player sets it per ship; these are the starting values):
   *  this many rounds per burst, then a pause of this many seconds. */
  burstRounds: 20,
  burstIntervalS: 1,
  /** Against ships (Manual, or Auto with the toggle): hits per second inside effective
   *  range, each doing this much damage. */
  shipHitsPerS: 0.5,
  shipHull: 0.03,
  shipSubsystem: 0.15,
  /** A barrage at a point: torpedoes passing within this distance of it are engaged. */
  curtainRadius: 2_000,
  /** Auto also fires at enemy ships inside effective range. */
  autoEngagesShips: false,
};

// Railguns (DESIGN.md section 7). Light turrets (frigates, destroyers) cover an arc around
// the bow; spinal guns (cruisers, capital ships) are fixed along the keel, so the ship must
// point at the target. Fire only on the player's order (CLAUDE.md rule 10).
export const railgunTuning = {
  light: { slugSpeed: 20_000, rechargeS: 8, ammo: 40, arcDeg: 75, damageScale: 1 },
  spinal: { slugSpeed: 25_000, rechargeS: 30, ammo: 20, arcDeg: 1, damageScale: 2 },
  /** Slugs that hit nothing are removed after this long, s. */
  slugMaxLifeS: 900,
  /** A new slug cannot hit its own ship for this long, s. */
  muzzleSafeS: 1,
  /** PDC kill chance against a slug, as a fraction of that against a torpedo. */
  pdcSlugFactor: 0.3,
  /** Predicted slug paths: a point every this many seconds. */
  pathSampleS: 2,
  /** A predicted slug path passing this close to one of our ships counts as incoming. */
  dangerRadius: 2_000,
};
