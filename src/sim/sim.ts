// The simulation step. Fixed timestep (CLAUDE.md rule 2): 20 ticks per second of sim time.
// Time compression runs more ticks, never bigger ones.

import { navTuning } from "../data/nav";
import { clampOutsideBodies, navigate, maxAccel, turnRate } from "./autopilot";
import { freshNavState, type Command, type QueuedCommand, type SimEvent } from "./commands";
import { angleBetween, integrate, slerpToward } from "./physics";
import { resolveTarget } from "./target";
import { scale, sub } from "./vec3";
import type { World } from "./world";

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

/** Queues a command from a faction. It applies at the start of the next tick. */
export function submit(world: World, faction: string, command: Command): void {
  world.pending.push({ tick: world.tick, faction, command });
}

function reject(world: World, q: QueuedCommand, reason: string) {
  world.events.push({ type: "commandRejected", faction: q.faction, command: q.command, reason });
}

function applyCommand(world: World, q: QueuedCommand): void {
  const c = q.command;
  const ship = world.ships.find((s) => s.id === c.ship);
  if (!ship) return reject(world, q, "no such ship");
  if (ship.faction !== q.faction) return reject(world, q, "not your ship");

  if ("g" in c && c.g) ship.g = c.g;
  switch (c.type) {
    case "setG":
      return;
    case "coast":
      ship.order = null;
      break;
    case "burnTo":
      // No destinations inside a body's safety zone: move them to the zone's edge.
      ship.order = { type: "burnTo", point: clampOutsideBodies(world.bodies, c.point).point };
      break;
    case "intercept":
      if (!resolveTarget(world, c.target)) return reject(world, q, "unknown target");
      ship.order = { type: "intercept", target: c.target, mode: c.mode };
      break;
    case "matchVelocity":
      if (!resolveTarget(world, c.target)) return reject(world, q, "unknown target");
      ship.order = { type: "matchVelocity", target: c.target };
      break;
    case "stationKeep": {
      const t = resolveTarget(world, c.target);
      if (!t) return reject(world, q, "unknown target");
      // Hold the current offset from a ship or object; hold exactly at a point.
      const offset = c.target.kind === "point" ? { x: 0, y: 0, z: 0 } : sub(ship.position, t.position);
      const target = c.target.kind === "point" ? { kind: "point" as const, position: clampOutsideBodies(world.bodies, c.target.position).point } : c.target;
      ship.order = { type: "stationKeep", target, offset };
      break;
    }
    case "orient":
      if (!resolveTarget(world, c.target)) return reject(world, q, "unknown target");
      ship.order = { type: "orient", target: c.target };
      break;
  }
  ship.nav = freshNavState();
}

/** Advances the world by one tick. */
export function step(world: World): void {
  const events: SimEvent[] = [];
  world.events = events;

  // Commands, in submission order.
  if (world.pending.length) {
    const due = world.pending.filter((q) => q.tick <= world.tick);
    world.pending = world.pending.filter((q) => q.tick > world.tick);
    for (const q of due) applyCommand(world, q);
  }

  const alignTol = (navTuning.alignToleranceDeg * Math.PI) / 180;
  for (const ship of world.ships) {
    const out = navigate(world, ship, events);
    ship.heading = slerpToward(ship.heading, out.heading, turnRate(ship) * DT);
    const aligned = angleBetween(ship.heading, out.heading) <= alignTol;
    const thrust = aligned ? Math.min(out.thrust, maxAccel(ship)) : 0;
    ship.thrust = thrust;
    ship.nav.phase = out.phase;
    integrate(ship.position, ship.velocity, scale(ship.heading, thrust), DT);
  }

  for (const t of world.torpedoes) integrate(t.position, t.velocity, scale(t.heading, t.thrust), DT);
  for (const s of world.stations) integrate(s.position, s.velocity, { x: 0, y: 0, z: 0 }, DT);

  world.tick++;
}
