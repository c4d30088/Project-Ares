// Point defense cannons (DESIGN.md section 7). Each mount covers its own arc of the hull,
// engages one target at a time, takes time to swing to a new one, and runs out of ammo.
// Kills are rolled on the seeded RNG, so a salvo that outnumbers the guns leaks through.
// Only PDCs have an automatic mode (CLAUDE.md rule 10).

import { loadouts } from "../../data/combat";
import { pdcTuning as PT } from "../../data/weapons";
import type { SimEvent } from "../commands";
import { applyHit, destroy } from "../damage";
import { angleBetween } from "../physics";
import { Rng } from "../rng";
import { pdcMountDirections, shipFrame, toWorld } from "../shipFrame";
import { resolveTarget, type Target } from "../target";
import { dot, length, normalize, scale, sub, type Vec3 } from "../vec3";
import { areHostile, type PdcMount, type Ship, type ShipClass, type Torpedo, type World } from "../world";

export function initPdcs(cls: ShipClass): PdcMount[] {
  return Array.from({ length: loadouts[cls].pdcCount }, () => ({
    mode: "auto" as const,
    assigned: null,
    engaged: null,
    switchS: 0,
    rounds: PT.roundsPerMount,
    firing: false,
    burstLeft: PT.burstRounds,
    burstWaitS: 0,
  }));
}

export function initBurst(): { enabled: boolean; rounds: number; intervalS: number } {
  return { enabled: false, rounds: PT.burstRounds, intervalS: PT.burstIntervalS };
}

/** Kill (or hit) rate at range r, per second: full inside effective range, none beyond max. */
export function pdcRate(r: number, full: number): number {
  if (r <= PT.effectiveRange) return full;
  if (r >= PT.maxRange) return 0;
  return (full * (PT.maxRange - r)) / (PT.maxRange - PT.effectiveRange);
}

/** Where each of a ship's mounts is firing this tick (null if it is not), for display. */
export function pdcAims(world: World, ship: Ship): (Vec3 | null)[] {
  return ship.weapons.pdcs.map((m) => {
    if (!m.firing || !m.engaged) return null;
    if (m.engaged === "point") return m.assigned?.kind === "point" ? { ...m.assigned.position } : null;
    const r = resolveTarget(world, { kind: "track", id: m.engaged }) ?? resolveTarget(world, { kind: "object", id: m.engaged });
    return r ? r.position : null;
  });
}

/** World direction a mount faces (the center of its arc). */
export function mountDirection(ship: Ship, i: number): Vec3 {
  return toWorld(shipFrame(ship.heading), pdcMountDirections(ship.weapons.pdcs.length)[i]);
}

function covers(ship: Ship, dir: Vec3, p: Vec3): boolean {
  const r = sub(p, ship.position);
  const d = length(r);
  if (d > PT.maxRange) return false;
  if (d < 1) return true;
  return angleBetween(dir, scale(r, 1 / d)) <= (loadouts[ship.shipClass].pdcArcDeg * Math.PI) / 180;
}

/** Seconds until a torpedo reaches the ship at its current closing speed (threat order). */
function timeToReach(ship: Ship, t: Torpedo): number {
  const r = sub(ship.position, t.position);
  const d = length(r);
  const vc = d > 0 ? dot(sub(t.velocity, ship.velocity), scale(r, 1 / d)) : 0;
  return vc > 0 ? d / vc : Infinity;
}

function roll(world: World, p: number): boolean {
  const rng = new Rng(0);
  rng.setState(world.rngState);
  const hit = rng.next() < p;
  world.rngState = rng.getState();
  return hit;
}

/** Burst fire settings for a ship's mounts on Auto. */
export function setBurst(ship: Ship, enabled: boolean, rounds: number, intervalS: number): string | null {
  if (!ship.weapons.pdcs.length) return "no PDCs";
  if (!(rounds >= 1) || !(intervalS >= 0)) return "bad burst settings";
  ship.weapons.pdcBurst = { enabled, rounds: Math.round(rounds), intervalS };
  return null;
}

/** Sets the mode of one mount (index) or all of them. Manual with a target assigns it. */
export function setPdcs(ship: Ship, mount: number | "all", mode: PdcMount["mode"], target: Target | null = null): string | null {
  const mounts = ship.weapons.pdcs;
  if (!mounts.length) return "no PDCs";
  if (mount !== "all" && !mounts[mount]) return "no such PDC";
  for (const [i, m] of mounts.entries()) {
    if (mount !== "all" && i !== mount) continue;
    m.mode = mode;
    if (mode === "manual" && target) m.assigned = structuredClone(target);
    if (mode !== "manual") m.assigned = null;
  }
  return null;
}

/** What a mount should be shooting at now: an entity id, or a point (barrage). */
type Aim = { id: string; position: Vec3; kind: "torpedo" | "ship" | "object" } | { id: null; position: Vec3; kind: "point" };

function chooseAuto(world: World, ship: Ship, dir: Vec3, taken: Set<string>): Aim | null {
  // Nearest threat first: the incoming torpedo that will arrive soonest. Spread fire: a
  // torpedo another mount already has is only taken if nothing else is in reach.
  let best: { t: Torpedo; eta: number } | null = null;
  let fallback: { t: Torpedo; eta: number } | null = null;
  for (const t of world.torpedoes) {
    if (t.destroyed || !areHostile(world, ship.faction, t.faction) || !covers(ship, dir, t.position)) continue;
    const eta = timeToReach(ship, t);
    const r = length(sub(t.position, ship.position));
    const key = Math.min(eta, r / 1000); // closing ones by time, loiterers by range
    if (!taken.has(t.id)) {
      if (!best || key < best.eta) best = { t, eta: key };
    } else if (!fallback || key < fallback.eta) fallback = { t, eta: key };
  }
  const pick = best ?? fallback;
  if (pick) return { id: pick.t.id, position: pick.t.position, kind: "torpedo" };
  if (PT.autoEngagesShips) {
    for (const s of world.ships) {
      if (s.destroyed || !areHostile(world, ship.faction, s.faction)) continue;
      if (length(sub(s.position, ship.position)) <= PT.effectiveRange && covers(ship, dir, s.position)) return { id: s.id, position: s.position, kind: "ship" };
    }
  }
  return null;
}

function chooseManual(world: World, ship: Ship, dir: Vec3, target: Target): Aim | null {
  if (target.kind === "point") return covers(ship, dir, target.position) ? { id: null, position: target.position, kind: "point" } : null;
  const r = resolveTarget(world, target);
  if (!r || !covers(ship, dir, r.position)) return null;
  const kind = world.torpedoes.some((t) => t.id === target.id) ? "torpedo" : world.ships.some((s) => s.id === target.id) ? "ship" : "object";
  return { id: target.id, position: r.position, kind };
}

/**
 * One tick of point defense for every ship. Runs on start-of-tick positions (before
 * anything moves), like torpedo guidance.
 */
export function runPdcs(world: World, dt: number, events: SimEvent[]): void {
  for (const ship of world.ships) {
    const taken = new Set<string>();
    for (const [i, m] of ship.weapons.pdcs.entries()) {
      const health = ship.health[`pdc${i + 1}`] ?? 0;
      m.firing = false;
      if (m.mode === "hold" || health <= 0 || m.rounds < 1) {
        m.engaged = null;
        continue;
      }
      // A manual assignment that no longer exists (a torpedo shot down, a ship destroyed)
      // hands the mount back to Auto.
      if (m.mode === "manual" && m.assigned && m.assigned.kind !== "point" && !resolveTarget(world, m.assigned)) {
        m.mode = "auto";
        m.assigned = null;
      }
      const dir = mountDirection(ship, i);
      const aim = m.mode === "auto" ? chooseAuto(world, ship, dir, taken) : m.assigned ? chooseManual(world, ship, dir, m.assigned) : null;
      const key = aim ? aim.id ?? "point" : null;
      if (key !== m.engaged) {
        m.engaged = key;
        m.switchS = aim ? PT.switchS / Math.max(0.25, health) : 0;
        // A new target starts a fresh burst.
        m.burstLeft = ship.weapons.pdcBurst.rounds;
        m.burstWaitS = 0;
      }
      if (!aim) continue;
      if (aim.id) taken.add(aim.id);
      if (m.switchS > 0) {
        m.switchS = Math.max(0, m.switchS - dt);
        continue;
      }
      // Burst fire (Auto only): fire the burst, pause, fire again.
      const burst = m.mode === "auto" && ship.weapons.pdcBurst.enabled ? ship.weapons.pdcBurst : null;
      if (burst && m.burstWaitS > 0) {
        m.burstWaitS = Math.max(0, m.burstWaitS - dt);
        if (m.burstWaitS > 0) continue;
        m.burstLeft = burst.rounds;
      }
      const shots = Math.min(PT.roundsPerS * dt, m.rounds, burst ? m.burstLeft : Infinity);
      if (shots <= 0) continue;
      m.firing = true;
      m.rounds -= shots;
      if (burst) {
        m.burstLeft -= shots;
        if (m.burstLeft <= 1e-9) m.burstWaitS = burst.intervalS;
      }
      if (m.rounds < 1) {
        m.rounds = 0;
        events.push({ type: "pdcAmmoOut", ship: ship.id, mount: i + 1 });
      }
      // Kill and hit chances scale with the share of a full tick's rounds actually fired.
      fire(world, ship, i, aim, health, dt * (shots / (PT.roundsPerS * dt)), events);
    }
  }
}

function fire(world: World, ship: Ship, i: number, aim: Aim, health: number, dt: number, events: SimEvent[]): void {
  const mount = i + 1;
  if (aim.kind === "torpedo" && aim.id) {
    const t = world.torpedoes.find((x) => x.id === aim.id);
    if (!t || t.destroyed) return;
    const r = length(sub(t.position, ship.position));
    if (roll(world, 1 - Math.exp(-pdcRate(r, PT.killRatePerS) * health * dt))) {
      destroy(world, t, "pdc");
      events.push({ type: "pdcKill", ship: ship.id, mount, torpedo: t.id });
    }
  } else if (aim.kind === "point") {
    // Barrage curtain: every hostile torpedo passing through it is at risk.
    for (const t of world.torpedoes) {
      if (t.destroyed || !areHostile(world, ship.faction, t.faction)) continue;
      if (length(sub(t.position, aim.position)) > PT.curtainRadius) continue;
      const r = length(sub(t.position, ship.position));
      if (roll(world, 1 - Math.exp(-pdcRate(r, PT.killRatePerS) * health * dt))) {
        destroy(world, t, "pdc");
        events.push({ type: "pdcKill", ship: ship.id, mount, torpedo: t.id });
      }
    }
  } else if (aim.kind === "ship" && aim.id) {
    const s = world.ships.find((x) => x.id === aim.id);
    if (!s || s.destroyed) return;
    const r = length(sub(s.position, ship.position));
    if (roll(world, 1 - Math.exp(-pdcRate(r, PT.shipHitsPerS) * health * dt))) {
      applyHit(world, s, normalize(sub(ship.position, s.position)), PT.shipHull, PT.shipSubsystem, "pdc");
    }
  }
  // Objects: bodies and stations take no damage yet (fire is still shown).
}
