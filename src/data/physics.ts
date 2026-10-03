// Physics tunables.

export const physicsTuning = {
  /** Bodies pull on ships and torpedoes (DESIGN.md open question 3: decided, gravity on). */
  gravityEnabled: true,
  /** Default densities (kg/m³) used to give bodies mass from their size. A scenario can
   *  set a body's gm (m³/s²) directly instead. */
  density: { planet: 5500, moon: 3300, asteroid: 2000 },
};
