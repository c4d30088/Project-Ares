// Game state outside the sim: the world, the player's sensor picture, and selection.

import { loadScenario, type Scenario } from "../sim/scenario";
import { buildPerfectPicture, type SensorPicture } from "../sim/sensors/picture";
import type { World } from "../sim/world";
import type { Vec3 } from "../sim/vec3";

export interface Game {
  world: World;
  playerFaction: string;
  picture: SensorPicture;
  selectedId: string | null;
  /** Position of any object in the player's picture (own ship, track or body). */
  positionOf(id: string): Vec3 | null;
}

export function createGame(scenario: Scenario): Game {
  const world = loadScenario(scenario);
  const picture = buildPerfectPicture(world, scenario.playerFaction);
  const game: Game = {
    world,
    playerFaction: scenario.playerFaction,
    picture,
    selectedId: picture.ownShips[0]?.id ?? null,
    positionOf(id) {
      const p = game.picture;
      return (
        p.ownShips.find((s) => s.id === id)?.position ??
        p.tracks.find((t) => t.id === id)?.position ??
        p.bodies.find((b) => b.id === id)?.position ??
        null
      );
    },
  };
  return game;
}
