// All AI that runs inside the sim: the scripted enemy of M3 and AI captains (M5).

import { runCaptains } from "./captain";
import { runScripts } from "./scripted";
import type { World } from "../world";

export function runAi(world: World): void {
  runScripts(world);
  runCaptains(world);
}
