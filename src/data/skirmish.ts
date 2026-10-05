// Skirmish maps (M5). A map is a place and two starting positions; the setup screen picks
// how many enemies (1v1 or 1v2) and which AI personality they fly, and buildSkirmish()
// turns that into an ordinary scenario. Every distance is meters, every speed m/s.

import type { Scenario } from "../sim/scenario";
import type { Body } from "../sim/world";
import { personalityPresets, type PersonalityName } from "./ai";
import type { Vec3 } from "../sim/vec3";

/** Which range does the fight mostly get decided at? Torpedo range is thousands of km,
 *  railgun range hundreds, PDC range tens (DESIGN.md section 7). */
export type RangePhase = "long" | "mid" | "close";

export interface SkirmishMap {
  id: string;
  name: string;
  /** One or two plain sentences for the setup screen. */
  blurb: string;
  phase: RangePhase;
  seed: number;
  /** Our frigate: where it starts and how it is moving (heading follows the velocity if it moves). */
  player: { position: Vec3; velocity: Vec3; heading?: Vec3 };
  /** Where enemy ships start, in order: 1v1 uses the first, 1v2 the first two. */
  enemies: { position: Vec3; velocity: Vec3 }[];
  bodies: Body[];
}

export const rangePhaseLabels: Record<RangePhase, string> = {
  long: "LONG RANGE · TORPEDOES",
  mid: "MID RANGE · RAILGUNS",
  close: "CLOSE RANGE · PDCS",
};

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const KM = 1000;

export const skirmishMaps: SkirmishMap[] = [
  {
    id: "open-duel",
    name: "Open duel",
    blurb: "Open space and a few rocks. They close from 7,000 km; torpedo salvos decide it long before the guns do.",
    phase: "long",
    seed: 5101,
    player: { position: v(0, 0, 0), velocity: v(0, 0, 0), heading: v(1, 0, 0) },
    enemies: [
      { position: v(7000 * KM, 1500 * KM, 600 * KM), velocity: v(-500, -100, -40) },
      { position: v(6500 * KM, -2800 * KM, -400 * KM), velocity: v(-450, 190, 30) },
    ],
    bodies: [
      { id: "ast-1", name: "AST-5101", kind: "asteroid", position: v(2400 * KM, -700 * KM, 200 * KM), radius: 12 * KM },
      { id: "ast-2", name: "AST-5114", kind: "asteroid", position: v(4300 * KM, 800 * KM, 500 * KM), radius: 8 * KM },
      { id: "ast-3", name: "AST-5127", kind: "asteroid", position: v(1300 * KM, 1700 * KM, -300 * KM), radius: 9 * KM },
    ],
  },
];

export const skirmishMapIds = skirmishMaps.map((m) => m.id);

export interface SkirmishSetup {
  map: string;
  enemies: 1 | 2;
  personality: PersonalityName;
}

/** The setup read back from a page address (?skirmish=open-duel&enemies=2&ai=hunter), or null. */
export function parseSkirmish(params: URLSearchParams): SkirmishSetup | null {
  const map = params.get("skirmish");
  if (!map || !skirmishMaps.some((m) => m.id === map)) return null;
  const ai = params.get("ai") ?? "";
  return {
    map,
    enemies: params.get("enemies") === "2" ? 2 : 1,
    personality: ai in personalityPresets ? (ai as PersonalityName) : "duelist",
  };
}

/** The page address that starts this setup. */
export function skirmishQuery(setup: SkirmishSetup): string {
  return `?skirmish=${setup.map}&enemies=${setup.enemies}&ai=${setup.personality}`;
}

export function buildSkirmish(setup: SkirmishSetup): Scenario {
  const map = skirmishMaps.find((m) => m.id === setup.map);
  if (!map) throw new Error(`Skirmish: unknown map "${setup.map}"`);
  const enemies = map.enemies.slice(0, setup.enemies);
  return {
    name: `Skirmish: ${map.name}`,
    seed: map.seed,
    playerFaction: "blue",
    factions: [
      { id: "blue", name: "Own forces", hostileTo: ["red"] },
      { id: "red", name: "Opposing forces", hostileTo: ["blue"] },
    ],
    ships: [
      {
        id: "blue-ff1",
        name: "FF-1 WARDEN",
        faction: "blue",
        shipClass: "frigate",
        position: map.player.position,
        velocity: map.player.velocity,
        ...(map.player.heading ? { heading: map.player.heading } : {}),
      },
      ...enemies.map((e, i) => ({
        id: `red-ff${i + 1}`,
        name: `TRK-${21 + i} FRIGATE`,
        faction: "red",
        shipClass: "frigate" as const,
        position: e.position,
        velocity: e.velocity,
      })),
    ],
    bodies: map.bodies,
    ai: enemies.map((_, i) => ({
      ship: `red-ff${i + 1}`,
      behavior: "captain" as const,
      ...(enemies.length > 1 ? { group: "red-pack" } : {}),
      personality: setup.personality,
    })),
  };
}
