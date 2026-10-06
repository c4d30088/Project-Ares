// Every tuning object in one place: what "copy values" exports and what the debug panel's
// explanations are looked up against.

import { aiTuning } from "./ai";
import { audioTuning } from "./audio";
import { bodyTuning } from "./bodies";
import { cameraTuning } from "./camera";
import { crewTuning } from "./crew";
import { effectsTuning } from "./effects";
import { holotableTuning } from "./holotable";
import { impactTuning } from "./impacts";
import { labelTuning } from "./labels";
import { navTuning } from "./nav";
import { pathTuning } from "./paths";
import { physicsTuning } from "./physics";
import { sensorTuning } from "./sensors";
import { symbolTuning } from "./symbols";
import { timeTuning } from "./time";
import { pdcTuning, railgunTuning, torpedoTuning } from "./weapons";

export const tuningRoots = {
  cameraTuning, holotableTuning, symbolTuning, effectsTuning, navTuning, timeTuning, bodyTuning,
  physicsTuning, torpedoTuning, pdcTuning, railgunTuning, crewTuning, pathTuning, impactTuning, labelTuning, aiTuning,
  sensorTuning, audioTuning,
};
