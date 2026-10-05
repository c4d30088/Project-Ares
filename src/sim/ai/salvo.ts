// Group salvo timing, shared by the scripted enemy and AI captains. Ships in a group share
// one salvo clock. A salvo is planned once every armed ship in the group is in range of its
// target; the farther ships then launch first and the nearer ones wait, so the torpedoes
// arrive together and split the target's guns.

import { torpedoTuning as TT } from "../../data/weapons";
import { timeToGo, torpedoAccel } from "../weapons/torpedo";
import { dot, length, sub, type Vec3 } from "../vec3";
import type { World } from "../world";

/** What the planner needs from a ship's AI entry. */
export interface SalvoMember {
  ship: string;
  /** Fires torpedoes inside this range, m. */
  launchRange: number;
  state: { launchAtS: number | null };
}

/** Rough torpedo flight time over distance d, starting with the launcher's closing speed
 *  (for timing salvos). */
export function flightTime(d: number, closing: number): number {
  return timeToGo(d, Math.max(0, closing), torpedoAccel(), TT.deltaV - TT.terminalReserve);
}

/** The group's members still in the world. */
export function groupMembers<T extends { ship: string; group?: string }>(world: World, members: readonly T[], key: string): T[] {
  return members.filter((x) => (x.group ?? x.ship) === key && world.ships.some((s) => s.id === x.ship));
}

/** Plans the group's next salvo if it is due and every armed ship is in range: sets each
 *  member's `launchAtS`. `intervalS` is the gap to the salvo after. */
export function planGroupSalvo(
  world: World,
  key: string,
  members: readonly SalvoMember[],
  target: { position: Vec3; velocity: Vec3 },
  t: number,
  intervalS: number,
): void {
  const g = (world.aiGroups[key] ??= { nextSalvoS: t, salvoAtS: null });
  if (g.salvoAtS !== null || t < g.nextSalvoS) return;
  const plan = members.map((x) => {
    const s = world.ships.find((y) => y.id === x.ship)!;
    const r = sub(target.position, s.position);
    const dd = length(r);
    const armed = s.weapons.magazine > 0;
    return { x, armed, inRange: dd <= x.launchRange, flight: flightTime(dd, dot(sub(s.velocity, target.velocity), r) / dd) };
  });
  const firing = plan.filter((p) => p.armed);
  if (firing.length && firing.every((p) => p.inRange)) {
    const longest = Math.max(...firing.map((p) => p.flight));
    for (const p of firing) p.x.state.launchAtS = t + (longest - p.flight);
    g.salvoAtS = t;
    g.nextSalvoS = t + intervalS;
  }
}

/** Call after a member launches: the group may plan again once nobody is waiting to launch. */
export function finishGroupLaunch(world: World, key: string, members: readonly SalvoMember[]): void {
  const g = world.aiGroups[key];
  if (g && members.every((x) => x.state.launchAtS === null)) g.salvoAtS = null;
}
