// AI captain tunables (M5). Behavior scores and ranges for the utility AI in
// src/sim/ai/captain.ts, and the personality presets.

/** Each 0 to 1. Aggression: presses close, salvoes big and often, retreats late. Caution:
 *  evades incoming torpedoes sooner, takes cover, retreats earlier. Emissions discipline:
 *  prefers quiet (cold) launches; it has no effect on being seen until sensors return (M4). */
export interface Personality {
  aggression: number;
  caution: number;
  emissionsDiscipline: number;
}

export const personalityPresets = {
  hunter: { aggression: 0.85, caution: 0.2, emissionsDiscipline: 0.2 },
  duelist: { aggression: 0.5, caution: 0.5, emissionsDiscipline: 0.5 },
  skulker: { aggression: 0.25, caution: 0.85, emissionsDiscipline: 0.9 },
} as const satisfies Record<string, Personality>;

export type PersonalityName = keyof typeof personalityPresets;

export const personalityLabels: Record<PersonalityName, string> = {
  hunter: "Hunter",
  duelist: "Duelist",
  skulker: "Skulker",
};

export function resolvePersonality(p: PersonalityName | Personality): Personality {
  return typeof p === "string" ? { ...personalityPresets[p] } : { ...p };
}

export const aiTuning = {
  /** A captain thinks this often, s. */
  thinkS: 1,
  /** While closing or moving to a point, the route is planned again this often, s. */
  replanS: 60,

  // Range. The hold range runs from `holdRangeFarM` (aggression 0) to `holdRangeNearM`
  // (aggression 1). It holds anywhere between the low and high fraction of it.
  holdRangeFarM: 3_000_000,
  holdRangeNearM: 400_000,
  holdBandLow: 0.7,
  holdBandHigh: 1.1,

  // Weapons.
  /** Torpedoes are launched inside this range, m. */
  launchRangeM: 3_000_000,
  /** The railgun fires inside this range, m. */
  railgunRangeM: 400_000,
  /** Salvo size and gap, from aggression 0 to 1. */
  salvoSizeMin: 2,
  salvoSizeMax: 6,
  salvoGapSlowS: 150,
  salvoGapFastS: 60,
  /** A cold launch needs the launcher to be closing at least this fast, m/s. */
  coldMinClosing: 2000,

  // Behavior scores (0 to 1). The highest wins each second; a new behavior must beat the
  // current one by the switch margin so the captain does not dither.
  stationScore: 0.5,
  orientScore: 0.7,
  switchMargin: 0.08,
  /** Retreat when hull falls below base - aggression * a + caution * b (fading in over `retreatFadeHull`). */
  retreatHullBase: 0.5,
  retreatHullAggression: 0.35,
  retreatHullCaution: 0.15,
  retreatFadeHull: 0.25,
  /** Retreat score when out of torpedoes and slugs: nothing left to fight with. */
  dryRetreatScore: 0.8,
  /** Evade torpedoes that will hit inside this many seconds; score is base + (1 - base) * caution, scaled by urgency. */
  evadeWindowS: 150,
  evadeBase: 0.3,
  /** Take cover: score is (floor + (1 - floor) * caution) * exposure, only for bodies this close, m.
   *  Exposure is 1 with torpedoes inbound, `coverIdleExposure` when only in enemy torpedo range. */
  coverFloor: 0.2,
  coverIdleExposure: 0.75,
  coverMaxTravelM: 1_500_000,
  /** Stand this far outside a body's surface, m. */
  coverMarginM: 30_000,
  /** How far away a retreating ship heads, m. */
  retreatDistanceM: 30_000_000,
  /** A retreating ship burns at Combat G until its crew strain reaches this, then at Cruise G. */
  retreatStrainLimit: 0.7,
  /** A retreating ship this far from every enemy ship has escaped and leaves the fight, m. */
  escapeRangeM: 10_000_000,
};
