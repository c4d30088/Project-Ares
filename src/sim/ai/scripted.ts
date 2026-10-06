// Scripted enemy (M3 step 7). Not the AI captain (captain.ts): a fixed routine. It decides from
// its own side's sensor picture only and acts only through commands, exactly as the
// player does (CLAUDE.md rules 5 and 6). It runs inside the sim once a second, so a fight
// replays the same from the same seed.
//
// "skirmisher": close to engagement range at Cruise G and hold there at Combat G; fire torpedo
// salvos on a timer (ships in a group share the timer and time their salvos to arrive
// together); inside railgun range, keep the target in the railgun's arc and shoot when
// the gun is ready. Out of torpedoes, close to railgun range and fight it out.
// Sensors (M4 Sensors Lite): it always runs them. With no enemy in sight it flies to where
// its side last saw one (along its last course), weapons quiet.

import { submit, TICK_RATE } from "../sim";
import { buildSensorPicture } from "../sensors/picture";
import { railgunBlocked } from "../weapons/railgun";
import { add, dot as dotV, length, scale, sub, type Vec3 } from "../vec3";
import { finishGroupLaunch, groupMembers, planGroupSalvo } from "./salvo";
import type { SkirmisherScript, World } from "../world";

/** Scripted ships think this often, s. */
const THINK_S = 1;
/** Re-plan the approach this often while closing, s. */
const NAV_REPLAN_S = 60;
/** Out of torpedoes, close to this fraction of railgun range. */
const BRAWL_RANGE = 0.75;
/** Launch cold only when closing on the target at least this fast, m/s. */
const COLD_MIN_CLOSING = 2000;

export function runScripts(world: World): void {
  const t = world.tick / TICK_RATE;
  for (const ai of world.ai) {
    if (ai.behavior !== "skirmisher") continue;
    if (world.tick < ai.state.nextThinkTick) continue;
    ai.state.nextThinkTick = world.tick + Math.round(THINK_S * TICK_RATE);
    const ship = world.ships.find((s) => s.id === ai.ship);
    if (!ship) continue;
    think(world, ai, t);
  }
}

function think(world: World, ai: SkirmisherScript, t: number): void {
  const ship = world.ships.find((s) => s.id === ai.ship)!;
  const faction = ship.faction;
  // Only what its side can see.
  const pic = buildSensorPicture(world, faction);
  const me = pic.ownShips.find((s) => s.id === ai.ship)!;
  const order = (command: Parameters<typeof submit>[2]) => submit(world, faction, command);
  if (!me.sensorsOn) order({ type: "setSensors", ship: ai.ship, on: true });
  let target: { id: string; position: Vec3; velocity: Vec3 } | null = null;
  let best = Infinity;
  for (const tr of pic.tracks) {
    if (tr.kind !== "ship" || tr.allegiance !== "hostile" || tr.lost) continue;
    const d = length(sub(tr.position, me.position));
    if (d < best) {
      best = d;
      target = tr;
    }
  }
  if (!target) {
    // Nobody in sight: head for the latest sighting, along its last course.
    const lost = pic.tracks.filter((tr) => tr.kind === "ship" && tr.allegiance === "hostile" && tr.lost).sort((a, b) => b.lastUpdateTick - a.lastUpdateTick)[0];
    if (!lost) {
      if (me.orderType) order({ type: "coast", ship: ai.ship });
      return;
    }
    const where = add(lost.position, scale(lost.velocity, lost.lost!.ageS));
    if (me.orderType !== "burnTo" || t - ai.state.navIssuedS > NAV_REPLAN_S) {
      order({ type: "burnTo", ship: ai.ship, point: where, g: "cruise" });
      ai.state.navIssuedS = t;
    }
    return;
  }
  const d = best;
  const tgt = { kind: "track" as const, id: target.id };
  // Out of torpedoes: close in and fight it out with the railgun.
  const brawl = me.torpedoes.magazine + me.torpedoes.queued === 0 && ai.railgunRange > 0 && !!me.railgun && me.railgun.slugs > 0;
  const holdAt = brawl ? ai.railgunRange * BRAWL_RANGE : ai.engageRange;

  // Movement: close to engagement range, then hold it; inside railgun range keep the
  // target in the gun's arc.
  const railgunWanted = ai.railgunRange > 0 && d <= ai.railgunRange && me.railgun && me.railgun.slugs > 0;
  const outOfArc = railgunWanted && railgunBlocked(world, ship, tgt)?.startsWith("out of arc");
  if (outOfArc) {
    if (me.orderType !== "orient") order({ type: "orient", ship: ai.ship, target: tgt });
  } else if (d > holdAt * 1.1) {
    if (me.orderType !== "burnTo" || t - ai.state.navIssuedS > NAV_REPLAN_S) {
      const point = add(target.position, scale(sub(me.position, target.position), holdAt / d));
      // The long approach at crew-safe Cruise G, so the crew arrives fresh.
      order({ type: "burnTo", ship: ai.ship, point, g: "cruise" });
      ai.state.navIssuedS = t;
    }
  } else if (me.orderType !== "matchVelocity") {
    order({ type: "matchVelocity", ship: ai.ship, target: tgt, g: "combat" });
  }

  // Torpedo salvos on the (group's) timer. A salvo is planned once every ship in the group
  // is in range of its target; then the farther ships launch first and the nearer ones
  // wait, so the salvos arrive together and split the target's guns.
  const key = ai.group ?? ai.ship;
  const members = groupMembers(world, world.ai.filter((x): x is SkirmisherScript => x.behavior === "skirmisher"), key);
  planGroupSalvo(world, key, members, target, t, ai.salvoIntervalS);
  if (ai.state.launchAtS !== null && t >= ai.state.launchAtS) {
    ai.state.salvos++;
    // Cold only pays when the ship is closing fast: a cold torpedo just coasts on the
    // launcher's motion until it lights.
    const closing = -dotV(sub(me.velocity, target.velocity), sub(me.position, target.position)) / d;
    const cold = ai.coldEvery > 0 && ai.state.salvos % ai.coldEvery === 0 && closing > COLD_MIN_CLOSING;
    order({ type: "launchTorpedoes", ship: ai.ship, target: tgt, count: ai.salvoSize, mode: cold ? "cold" : "hot" });
    ai.state.launchAtS = null;
    finishGroupLaunch(world, key, members);
  }

  // Railgun: whenever it is ready and the target is in its arc.
  if (railgunWanted && !railgunBlocked(world, ship, tgt)) order({ type: "fireRailgun", ship: ai.ship, target: tgt });
}
