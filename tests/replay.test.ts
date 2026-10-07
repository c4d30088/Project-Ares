// After-action replay: re-running the fight from the recorded copies and the player's commands
// gives back exactly what happened, at any moment; and "their picture" shows only what the
// enemy knew, in our colors.

import { describe, expect, it } from "vitest";
import { buildSkirmish } from "../src/data/skirmish";
import { createGame } from "../src/game/game";
import { theirPictureInOurColors } from "../src/game/replay";
import { buildPicture } from "../src/sim/sensors/picture";
import { loadScenario } from "../src/sim/scenario";
import { DT } from "../src/sim/sim";
import type { World } from "../src/sim/world";

/** The world without this tick's events: what must match between the fight and its replay. */
const state = (w: World) => JSON.stringify({ ...w, events: [] });

/** Advances the game to a tick at high compression, as if time were sped up. */
function runTo(game: ReturnType<typeof createGame>, tick: number) {
  game.paused = false;
  let guard = 0;
  while (game.world.tick < tick && guard++ < 100000) {
    game.setCompression(5);
    game.update(Math.min(0.25, (tick - game.world.tick) * DT / game.compression + 1e-6));
    if (game.outcome) break;
  }
}

describe("after-action replay", () => {
  it("re-runs the fight exactly, at moments between the saved copies", () => {
    const game = createGame(buildSkirmish({ map: "knife-fight", enemies: 1, personality: "hunter" }));
    const own = game.world.ships.find((s) => s.faction === game.playerFaction)!;
    const enemy = game.world.ships.find((s) => s.faction !== game.playerFaction)!;
    // Some orders at odd moments: G, a burn, a launch at the enemy, sensors on.
    game.issue({ type: "setG", ship: own.id, g: "combat" });
    runTo(game, 137);
    game.issue({ type: "burnTo", ship: own.id, point: { x: own.position.x + 50_000, y: own.position.y + 20_000, z: 5_000 } });
    runTo(game, 451);
    game.issue({ type: "launchTorpedoes", ship: own.id, target: { kind: "track", id: enemy.id }, count: 2, mode: "hot" });
    runTo(game, 1013);
    game.issue({ type: "setSensors", ship: own.id, on: true });
    runTo(game, 1333);
    const at1333 = state(game.world); // not a copy tick (copies every 600)
    runTo(game, 2100);
    const endTick = game.world.tick;
    const atEnd = state(game.world);

    game.startReplay();
    expect(game.replay).not.toBeNull();
    expect(game.world.tick).toBe(0);
    game.replaySeek(1333 * DT);
    expect(game.world.tick).toBe(1333);
    expect(state(game.world)).toBe(at1333);

    // Commands are ignored during a replay.
    game.issue({ type: "setG", ship: own.id, g: "max" });
    game.replaySeek(endTick * DT);
    expect(state(game.world)).toBe(atEnd);

    // Leaving the replay puts the fight back as it ended.
    game.exitReplay();
    expect(game.replay).toBeNull();
    expect(state(game.world)).toBe(atEnd);
  }, 60_000);

  it("their picture: their ships are hostile, ours friendly, only what they knew", () => {
    const world = loadScenario(buildSkirmish({ map: "open-duel", enemies: 1, personality: "duelist" }));
    const enemyFaction = world.ships.find((s) => s.faction !== world.ships[0].faction)!.faction;
    const theirs = buildPicture(world, enemyFaction);
    const shown = theirPictureInOurColors(theirs);
    expect(shown.ownShips).toEqual([]);
    for (const s of theirs.ownShips) expect(shown.tracks.find((t) => t.id === s.id)?.allegiance).toBe("hostile");
    for (const t of theirs.tracks) {
      const after = shown.tracks.find((x) => x.id === t.id)!;
      if (t.allegiance === "hostile") expect(after.allegiance).toBe("friendly");
      expect(after.position).toEqual(t.position); // where they thought it was, not where it is
    }
  });
});
