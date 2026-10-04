// Subsystem damage (DESIGN.md section 9). No hit-point bar: each subsystem has its own
// health from 1 (intact) to 0 (destroyed). Where a hit lands depends on the side it came
// from, relative to the ship's orientation.

import { combatTuning as C, hitSectors, loadouts } from "../data/combat";
import { Rng } from "./rng";
import { pdcMountDirections, shipFrame, toLocal } from "./shipFrame";
import type { Vec3 } from "./vec3";
import type { Ship, ShipClass, World } from "./world";

export type Health = Record<string, number>;

/** Subsystem ids for a class: hull, drive, reactor, sensors, radiators, crew, tubes,
 *  railgun (if fitted) and pdc1..pdcN. */
export function initHealth(cls: ShipClass): Health {
  const lo = loadouts[cls];
  const h: Health = { hull: 1, drive: 1, reactor: 1, sensors: 1, radiators: 1, crew: 1, tubes: 1 };
  if (lo.railguns > 0) h.railgun = 1;
  for (let i = 1; i <= lo.pdcCount; i++) h[`pdc${i}`] = 1;
  return h;
}

export type HitSide = "front" | "rear" | "left" | "right" | "top" | "bottom";

/** Which side of the ship a hit came from. `from` points from the ship toward the source. */
export function hitSide(ship: Ship, from: Vec3): HitSide {
  const l = toLocal(shipFrame(ship.heading), from);
  const af = Math.abs(l.f), al = Math.abs(l.l), au = Math.abs(l.u);
  if (af >= al && af >= au) return l.f >= 0 ? "front" : "rear";
  if (al >= au) return l.l >= 0 ? "left" : "right";
  return l.u >= 0 ? "top" : "bottom";
}

/** Subsystems a hit from this side can strike, with weights. "pdc" expands to the mounts
 *  facing that side. */
export function sectorCandidates(ship: Ship, side: HitSide): [string, number][] {
  const sector = side === "front" ? hitSectors.front : side === "rear" ? hitSectors.rear : side === "left" || side === "right" ? hitSectors.side : hitSectors.topBottom;
  const mounts = pdcMountDirections(loadouts[ship.shipClass].pdcCount);
  const facing = mounts
    .map((m, i) => ({ id: `pdc${i + 1}`, m }))
    .filter(({ m }) => (side === "left" ? m.l > 0 : side === "right" ? m.l < 0 : side === "top" ? m.u > 0 : side === "bottom" ? m.u < 0 : true));
  const out: [string, number][] = [];
  for (const [name, w] of Object.entries(sector)) {
    if (name === "pdc") {
      const ids = (facing.length ? facing : mounts.map((m, i) => ({ id: `pdc${i + 1}`, m }))).map((x) => x.id);
      for (const id of ids) if (id in ship.health) out.push([id, w / ids.length]);
    } else if (name in ship.health) out.push([name, w]);
  }
  return out;
}

function pick(world: World, candidates: [string, number][]): string | null {
  const total = candidates.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  const rng = new Rng(0);
  rng.setState(world.rngState);
  let x = rng.next() * total;
  world.rngState = rng.getState();
  for (const [id, w] of candidates) {
    x -= w;
    if (x <= 0) return id;
  }
  return candidates[candidates.length - 1][0];
}

/**
 * Applies a hit. `from` points from the ship toward where the hit came from. Hull takes
 * `hull` damage; one subsystem on that side takes `subsystem` damage.
 */
export function applyHit(world: World, ship: Ship, from: Vec3, hull: number, subsystem: number, cause: string, attacker: string): void {
  if (ship.destroyed) return;
  const side = hitSide(ship, from);
  const struck = pick(world, sectorCandidates(ship, side));
  const hullBefore = ship.health.hull;
  ship.health.hull = Math.max(0, hullBefore - hull);
  const base = { type: "damage" as const, ship: ship.id, faction: ship.faction, attacker, side, cause, position: { ...ship.position }, hull: hullBefore - ship.health.hull };
  if (struck && struck !== "hull") {
    const before = ship.health[struck];
    ship.health[struck] = Math.max(0, before - subsystem);
    world.events.push({ ...base, subsystem: struck, amount: before - ship.health[struck] });
    if (before > 0 && ship.health[struck] === 0) world.events.push({ type: "subsystemDestroyed", ship: ship.id, subsystem: struck, position: { ...ship.position } });
  } else {
    world.events.push({ ...base, subsystem: "hull", amount: 0 });
  }
  if (ship.health.hull <= 0 || ship.health.reactor <= 0) destroy(world, ship, ship.health.reactor <= 0 ? "reactor breach" : cause);
}

export function destroy(world: World, entity: { id: string; destroyed?: boolean; position: Vec3 }, cause: string): void {
  if (entity.destroyed) return;
  entity.destroyed = true;
  const kind = world.ships.some((s) => s.id === entity.id) ? "ship" : world.torpedoes.some((t) => t.id === entity.id) ? "torpedo" : "slug";
  world.events.push({ type: "destroyed", id: entity.id, cause, kind, position: { ...entity.position } });
}

/** Drive output fraction after damage. */
export function driveFactor(ship: Ship): number {
  return Math.max(C.driveFloor, ship.health.drive ?? 1);
}
