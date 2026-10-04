// Crew tunables: G-strain (DESIGN.md section 9). Cruise G is crew-safe; above it strain
// builds, below it strain drains. Strain and crew losses lower crew efficiency: slower
// turns and worse PDC fire.

export const crewTuning = {
  /** Seconds to go from no strain to full at twice Cruise G (a frigate's Combat G).
   *  Strain builds in proportion to how far above Cruise G the ship is: three times
   *  Cruise G (a frigate's Max G) fills it in half the time. */
  strainFillS: 600,
  /** Seconds to drain from full to none at or below Cruise G. */
  strainRecoverS: 300,
  /** Crew efficiency at full strain (1 = unaffected). */
  efficiencyAtFullStrain: 0.5,
  /** Crew efficiency with the crew subsystem destroyed. */
  efficiencyAtNoCrew: 0.5,
  /** At full strain and still above Cruise G: crew casualties this often, s, each taking
   *  this much off crew health. */
  casualtyIntervalS: 5,
  casualtyDamage: 0.05,
  /** Strain warning in the alert strip above this. */
  strainWarn: 0.6,
};
