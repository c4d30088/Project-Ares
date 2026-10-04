// Scenario list for the picker. The first entry loads by default.

import type { Scenario } from "../../sim/scenario";
import flightTest from "./flight-test.json";
import holotableTest from "./holotable-test.json";
import pdcTest from "./pdc-test.json";
import firstFight from "./first-fight.json";

export const scenarios: Record<string, Scenario> = {
  "first-fight": firstFight as Scenario,
  "flight-test": flightTest as Scenario,
  "holotable-test": holotableTest as Scenario,
  "pdc-test": pdcTest as Scenario,
};

export const defaultScenario = "flight-test";
