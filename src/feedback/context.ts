// The game details sent with a note: which build, where the tester was, the fight time and
// result, the screen and display settings. Nothing about the person.

import { settings } from "../game/settings";
import type { NoteContext } from "./note";

export function noteContext(game: { simTime?: number; result?: string | null; replay?: boolean } = {}): NoteContext {
  const q = new URLSearchParams(location.search);
  const where = q.has("skirmish")
    ? `skirmish: ${q.get("skirmish")} 1v${q.get("enemies") === "2" ? 2 : 1} ${q.get("ai") ?? ""}`.trim()
    : q.has("scenario")
      ? `scenario: ${q.get("scenario")}`
      : "setup screen";
  const ctx: NoteContext = {
    build: __BUILD__,
    where,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    display: `${settings.palette}${settings.reduceEffects ? ", reduced effects" : ""}, UI ${Math.round(settings.uiScale * 100)}%`,
  };
  if (game.simTime !== undefined && where !== "setup screen") ctx.fightTimeS = game.simTime;
  if (game.result) ctx.result = game.result;
  if (game.replay) ctx.replay = true;
  return ctx;
}
