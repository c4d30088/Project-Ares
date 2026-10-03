// Scenario files (src/data/scenarios/*.json) describe a starting World.
// All values are SI: meters, m/s, m/s².

import { Rng } from "./rng";
import { add, normalize, scale, vec3, type Vec3 } from "./vec3";
import { freshNavState, type Command } from "./commands";
import { TICK_RATE } from "./sim";
import { initHealth } from "./damage";
import { initWeapons } from "./weapons/torpedo";
import type { Body, Faction, GSetting, Ship, Station, Torpedo, World } from "./world";

export interface SalvoSpec {
  idPrefix: string;
  faction: string;
  count: number;
  /** Center of the group. */
  center: Vec3;
  /** Each torpedo is placed randomly within this distance of the center. */
  spread: number;
  velocity: Vec3;
  /** Point the group is heading toward. */
  aimPoint: Vec3;
  thrust: number;
}

/** A ship as written in a scenario file. Heading defaults to the direction of travel;
 *  G setting defaults to cruise. Orders are given with `commands`. */
export interface ScenarioShip {
  id: string;
  name: string;
  faction: string;
  shipClass: Ship["shipClass"];
  position: Vec3;
  velocity: Vec3;
  heading?: Vec3;
  g?: GSetting;
  testShowAsUnknown?: boolean;
}

export interface Scenario {
  name: string;
  seed: number;
  playerFaction: string;
  factions: Faction[];
  ships: ScenarioShip[];
  stations?: Station[];
  bodies?: Body[];
  torpedoes?: Torpedo[];
  salvos?: SalvoSpec[];
  /** Orders given by the scenario: at the start, or `atS` seconds in. */
  commands?: { faction: string; command: Command; atS?: number }[];
}

function checkVec(v: Vec3, what: string): void {
  if (![v?.x, v?.y, v?.z].every(Number.isFinite)) {
    throw new Error(`Scenario: ${what} is not a valid vector`);
  }
}

export function loadScenario(scenario: Scenario): World {
  const rng = new Rng(scenario.seed);
  const factionIds = new Set(scenario.factions.map((f) => f.id));
  const ids = new Set<string>();
  const claimId = (id: string) => {
    if (ids.has(id)) throw new Error(`Scenario: duplicate id "${id}"`);
    ids.add(id);
  };
  const checkFaction = (f: string, who: string) => {
    if (!factionIds.has(f)) throw new Error(`Scenario: ${who} has unknown faction "${f}"`);
  };

  const ships: Ship[] = scenario.ships.map((s) => {
    claimId(s.id);
    checkFaction(s.faction, s.id);
    checkVec(s.position, `${s.id}.position`);
    checkVec(s.velocity, `${s.id}.velocity`);
    return {
      id: s.id,
      name: s.name,
      faction: s.faction,
      shipClass: s.shipClass,
      position: { ...s.position },
      velocity: { ...s.velocity },
      heading: normalize(s.heading ?? s.velocity),
      thrust: 0,
      g: s.g ?? "cruise",
      order: null,
      nav: freshNavState(),
      health: initHealth(s.shipClass),
      weapons: initWeapons(s.shipClass),
      ...(s.testShowAsUnknown ? { testShowAsUnknown: true } : {}),
    };
  });

  const stations: Station[] = (scenario.stations ?? []).map((s) => {
    claimId(s.id);
    checkFaction(s.faction, s.id);
    checkVec(s.position, `${s.id}.position`);
    return { ...s, position: { ...s.position }, velocity: { ...s.velocity } };
  });

  const bodies: Body[] = (scenario.bodies ?? []).map((b) => {
    claimId(b.id);
    checkVec(b.position, `${b.id}.position`);
    if (!(b.radius > 0)) throw new Error(`Scenario: ${b.id} needs a positive radius`);
    return { ...b, position: { ...b.position } };
  });

  const torpedoes: Torpedo[] = (scenario.torpedoes ?? []).map((t) => {
    claimId(t.id);
    checkFaction(t.faction, t.id);
    return { ...t, position: { ...t.position }, velocity: { ...t.velocity }, heading: normalize(t.heading) };
  });

  for (const salvo of scenario.salvos ?? []) {
    checkFaction(salvo.faction, salvo.idPrefix);
    checkVec(salvo.center, `${salvo.idPrefix}.center`);
    for (let i = 0; i < salvo.count; i++) {
      const id = `${salvo.idPrefix}-${String(i + 1).padStart(2, "0")}`;
      claimId(id);
      const offset = randomInSphere(rng, salvo.spread);
      const position = add(salvo.center, offset);
      const aim = { x: salvo.aimPoint.x - position.x, y: salvo.aimPoint.y - position.y, z: salvo.aimPoint.z - position.z };
      torpedoes.push({
        id,
        faction: salvo.faction,
        position,
        velocity: { ...salvo.velocity },
        heading: normalize(aim),
        thrust: salvo.thrust,
      });
    }
  }

  const pending = (scenario.commands ?? [])
    .map((c) => ({ tick: Math.round((c.atS ?? 0) * TICK_RATE), faction: c.faction, command: structuredClone(c.command) }))
    .sort((a, b) => a.tick - b.tick);
  return {
    tick: 0,
    rngState: rng.getState(),
    pending,
    events: [],
    factions: scenario.factions.map((f) => ({ ...f })),
    ships,
    stations,
    bodies,
    torpedoes,
  };
}

function randomInSphere(rng: Rng, radius: number): Vec3 {
  for (;;) {
    const p = vec3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
    if (p.x * p.x + p.y * p.y + p.z * p.z <= 1) return scale(p, radius);
  }
}
