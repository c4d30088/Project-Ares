// Scenario list for the picker. The first entry loads by default.

import type { Scenario } from "../../sim/scenario";
import flightTest from "./flight-test.json";
import holotableTest from "./holotable-test.json";

export const scenarios: Record<string, Scenario> = {
  "flight-test": flightTest as Scenario,
  "holotable-test": holotableTest as Scenario,
};

export const defaultScenario = "flight-test";
