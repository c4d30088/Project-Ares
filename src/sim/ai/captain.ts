// AI captain (M5). A utility AI: once a second it scores a few behaviors from its own
// side's picture and does the best one. It acts only through commands, exactly as the
// player does (CLAUDE.md rules 5, 6 and 10), and uses no randomness, so a fight replays
// the same from the same seed.
//
// Movement behaviors (one at a time):
//   station  close to the personality's hold range, then hold it
//   orient   swing the ship so the railgun's arc covers the target
//   evade    burn hard across the line of incoming torpedoes
//   cover    put a body between the ship and the enemy and stay there
//   retreat  burn directly away from the enemy
// Weapons run alongside, whatever the behavior: coordinated torpedo salvos on a timer, and
// the railgun whenever it is ready and the target is in its arc. PDCs stay on Auto.
//
// Personality (aggression, caution, emissions discipline) shifts every number: see
// captainParams() and the scores in scoreBehaviors().

import { aiTuning as A, type Personality } from "../../data/ai";
import { submit, TICK_RATE } from "../sim";
import { buildPerfectPicture, type ChartedBody, type OwnShip, type SensorPicture, type Track } from "../sensors/picture";
import { segmentHitsSphere } from "../collide";
import { railgunBlocked } from "../weapons/railgun";
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from "../vec3";
import { finishGroupLaunch, groupMembers, planGroupSalvo, type SalvoMember } from "./salvo";
import type { CaptainMode, CaptainScript, World } from "../world";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Re-aim an evasion burn this often while it lasts, s. */
const EVADE_REAIM_S = 15;

/** The numbers a personality works out to. */
export interface CaptainParams {
  /** Holds about this far from its target, m. */
  holdRange: number;
  salvoSize: number;
  salvoGapS: number;
  /** Retreats when hull falls below this fraction (the score fades in above it). */
  retreatHull: number;
  /** Every Nth salvo is launched cold, when closing fast (0 = never). */
  coldEvery: number;
}

export function captainParams(p: Personality): CaptainParams {
  const share = p.emissionsDiscipline;
  return {
    holdRange: lerp(A.holdRangeFarM, A.holdRangeNearM, p.aggression),
    salvoSize: Math.round(lerp(A.salvoSizeMin, A.salvoSizeMax, p.aggression)),
    salvoGapS: lerp(A.salvoGapSlowS, A.salvoGapFastS, p.aggression),
    retreatHull: clamp01(A.retreatHullBase - A.retreatHullAggression * p.aggression + A.retreatHullCaution * p.caution),
    coldEvery: share > 0.05 ? Math.max(1, Math.round(1 / share)) : 0,
  };
}

/** What the captain knows this second, boiled down for scoring. */
export interface Situation {
  /** Hull fraction left (the lower of hull and reactor). */
  hull: number;
  /** Nothing left to fight with: no torpedoes and no railgun slugs. */
  dry: boolean;
  /** The railgun can reach the target but the target is outside its arc. */
  gunOutOfArc: boolean;
  /** Hostile torpedoes aimed at this ship, and seconds until the first lands. */
  inbound: { count: number; soonestS: number };
  /** The enemy is inside its own torpedo range of us. */
  inEnemyRange: boolean;
  /** A body is near enough to hide behind (or already hides us). */
  coverAvailable: boolean;
}

export type Scores = Record<CaptainMode, number>;

export function scoreBehaviors(sit: Situation, p: Personality, params: CaptainParams = captainParams(p)): Scores {
  const hullScore = clamp01((params.retreatHull + A.retreatFadeHull - sit.hull) / A.retreatFadeHull);
  const evade =
    sit.inbound.count > 0 ? (A.evadeBase + (1 - A.evadeBase) * p.caution) * clamp01(1 - sit.inbound.soonestS / A.evadeWindowS) : 0;
  const exposure = sit.inbound.count > 0 ? 1 : sit.inEnemyRange ? A.coverIdleExposure : 0;
  return {
    station: A.stationScore,
    orient: sit.gunOutOfArc ? A.orientScore : 0,
    evade,
    retreat: Math.max(hullScore, sit.dry ? A.dryRetreatScore : 0),
    cover: sit.coverAvailable ? (A.coverFloor + (1 - A.coverFloor) * p.caution) * exposure : 0,
  };
}

const ORDER: CaptainMode[] = ["retreat", "evade", "cover", "orient", "station"];

/** The best-scoring behavior; the current one stays unless another beats it by the switch margin. */
export function chooseMode(scores: Scores, current: CaptainMode | null): CaptainMode {
  // Earlier entries win ties, so safety beats station.
  const best = ORDER.reduce((b, m) => (scores[m] > scores[b] ? m : b), ORDER[0]);
  if (current && scores[current] > 0 && scores[best] < scores[current] + A.switchMargin) return current;
  return best;
}

/** Where a ship at `me` would stand to have `body` between itself and `enemy`. */
export function coverPoint(body: Pick<ChartedBody, "position" | "radius">, enemy: Vec3): Vec3 {
  return add(body.position, scale(normalize(sub(body.position, enemy)), body.radius + A.coverMarginM));
}

/** True if a body lies on the line from the ship to the enemy. */
function hidden(bodies: readonly ChartedBody[], me: Vec3, enemy: Vec3): ChartedBody | null {
  return bodies.find((b) => segmentHitsSphere(me, enemy, b.position, b.radius)) ?? null;
}

/** The body whose cover point is nearest and within reach, if any. */
function bestCover(pic: SensorPicture, me: Vec3, enemy: Vec3): { body: ChartedBody; point: Vec3; inCover: boolean } | null {
  const inCover = hidden(pic.bodies, me, enemy);
  if (inCover) return { body: inCover, point: coverPoint(inCover, enemy), inCover: true };
  let best: { body: ChartedBody; point: Vec3; inCover: boolean } | null = null;
  let bestD = A.coverMaxTravelM;
  for (const body of pic.bodies) {
    const point = coverPoint(body, enemy);
    const d = length(sub(point, me));
    if (d < bestD) {
      bestD = d;
      best = { body, point, inCover: false };
    }
  }
  return best;
}

/** Hostile torpedoes aimed at this ship. */
function inboundTorpedoes(pic: SensorPicture, me: OwnShip): Track[] {
  return pic.tracks.filter((t) => t.kind === "torpedo" && t.allegiance === "hostile" && t.impact?.targetId === me.id);
}

/** The picture this captain decides from. Until sensors return (M4) it is perfect; going
 *  through this one function means the AI needs no change when they do. */
function pictureFor(world: World, faction: string): SensorPicture {
  return buildPerfectPicture(world, faction);
}

export function runCaptains(world: World): void {
  const t = world.tick / TICK_RATE;
  for (const ai of world.ai) {
    if (ai.behavior !== "captain") continue;
    if (world.tick < ai.state.nextThinkTick) continue;
    ai.state.nextThinkTick = world.tick + Math.round(A.thinkS * TICK_RATE);
    if (!world.ships.some((s) => s.id === ai.ship)) continue;
    think(world, ai, t);
  }
}

function think(world: World, ai: CaptainScript, t: number): void {
  const ship = world.ships.find((s) => s.id === ai.ship)!;
  const faction = ship.faction;
  const pic = pictureFor(world, faction);
  const me = pic.ownShips.find((s) => s.id === ai.ship)!;
  const order = (command: Parameters<typeof submit>[2]) => submit(world, faction, command);

  let target: Track | null = null;
  let d = Infinity;
  for (const tr of pic.tracks) {
    if (tr.kind !== "ship" || tr.allegiance !== "hostile") continue;
    const dd = length(sub(tr.position, me.position));
    if (dd < d) {
      d = dd;
      target = tr;
    }
  }
  if (!target) {
    if (me.orderType) order({ type: "coast", ship: ai.ship });
    ai.state.mode = ai.state.issuedMode = null;
    return;
  }

  const params = captainParams(ai.personality);
  const tgt = { kind: "track" as const, id: target.id };
  const hasTorpedoes = me.torpedoes.magazine + me.torpedoes.queued > 0;
  const hasSlugs = !!me.railgun && me.railgun.slugs > 0;
  const gunInRange = hasSlugs && d <= A.railgunRangeM;
  const gunBlock = gunInRange ? railgunBlocked(world, ship, tgt) : "out of range";
  const outOfArc = gunBlock === "out of arc" || gunBlock === "turn the ship to aim";
  const inbound = inboundTorpedoes(pic, me);
  const cover = bestCover(pic, me.position, target.position);

  const sit: Situation = {
    hull: Math.min(me.health.hull ?? 1, me.health.reactor ?? 1),
    dry: !hasTorpedoes && !hasSlugs,
    gunOutOfArc: outOfArc,
    inbound: { count: inbound.length, soonestS: inbound.length ? Math.min(...inbound.map((x) => x.impact!.t)) : Infinity },
    inEnemyRange: d <= A.launchRangeM,
    coverAvailable: !!cover,
  };
  const mode = chooseMode(scoreBehaviors(sit, ai.personality, params), ai.state.mode);
  ai.state.mode = mode;
  const fresh = mode !== ai.state.issuedMode;
  const stale = t - ai.state.navIssuedS > A.replanS;
  const issued = () => {
    ai.state.issuedMode = mode;
    ai.state.navIssuedS = t;
  };

  switch (mode) {
    case "retreat": {
      if (fresh || stale) {
        const away = normalize(sub(me.position, target.position));
        order({ type: "burnTo", ship: ai.ship, point: add(me.position, scale(away, A.retreatDistanceM)), g: "combat" });
        issued();
      }
      break;
    }
    case "evade": {
      if (fresh || t - ai.state.navIssuedS > EVADE_REAIM_S) {
        const soonest = inbound.reduce((a, b) => (b.impact!.t < a.impact!.t ? b : a));
        const bearing = normalize(sub(soonest.position, me.position));
        // Across the torpedo's line, in whichever direction the ship is already drifting.
        let across = sub(me.velocity, scale(bearing, dot(me.velocity, bearing)));
        if (length(across) < 1) across = cross(bearing, Math.abs(bearing.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 });
        order({ type: "burnTo", ship: ai.ship, point: add(me.position, scale(normalize(across), 2_000_000)), g: "max" });
        issued();
      }
      break;
    }
    case "cover": {
      if (cover) {
        const near = length(sub(cover.point, me.position)) < A.coverMarginM * 2;
        if (cover.inCover && near) {
          if (me.orderType !== "stationKeep" || fresh) {
            order({ type: "stationKeep", ship: ai.ship, target: { kind: "object", id: cover.body.id } });
            issued();
          }
        } else if (fresh || stale || me.orderType !== "burnTo") {
          order({ type: "burnTo", ship: ai.ship, point: cover.point, g: "cruise" });
          issued();
        }
      }
      break;
    }
    case "orient": {
      if (fresh || me.orderType !== "orient") {
        order({ type: "orient", ship: ai.ship, target: tgt });
        issued();
      }
      break;
    }
    default: {
      // Out of torpedoes, close to the railgun's range and fight it out.
      const hold = !hasTorpedoes && hasSlugs ? Math.min(params.holdRange, A.railgunRangeM * 0.75) : params.holdRange;
      if (d > hold * A.holdBandHigh || d < hold * A.holdBandLow) {
        if (fresh || stale || me.orderType !== "burnTo") {
          const point = add(target.position, scale(sub(me.position, target.position), hold / d));
          // The long approach at crew-safe Cruise G, so the crew arrives fresh.
          order({ type: "burnTo", ship: ai.ship, point, g: "cruise" });
          issued();
        }
      } else if (fresh || me.orderType !== "matchVelocity") {
        order({ type: "matchVelocity", ship: ai.ship, target: tgt, g: "combat" });
        issued();
      }
    }
  }

  // Torpedo salvos on the (group's) timer.
  const key = ai.group ?? ai.ship;
  const captains = world.ai.filter((x): x is CaptainScript => x.behavior === "captain");
  const members: SalvoMember[] = groupMembers(world, captains, key).map((x) => ({ ship: x.ship, launchRange: A.launchRangeM, state: x.state }));
  planGroupSalvo(world, key, members, target, t, params.salvoGapS);
  if (ai.state.launchAtS !== null && t >= ai.state.launchAtS) {
    ai.state.salvos++;
    // Cold only pays when the ship is closing fast: a cold torpedo just coasts on the
    // launcher's motion until it lights.
    const closing = -dot(sub(me.velocity, target.velocity), sub(me.position, target.position)) / d;
    const cold = params.coldEvery > 0 && ai.state.salvos % params.coldEvery === 0 && closing > A.coldMinClosing;
    order({ type: "launchTorpedoes", ship: ai.ship, target: tgt, count: params.salvoSize, mode: cold ? "cold" : "hot" });
    ai.state.launchAtS = null;
    finishGroupLaunch(world, key, members);
  }

  // Railgun: whenever it is ready and the target is in its arc.
  if (!gunBlock) order({ type: "fireRailgun", ship: ai.ship, target: tgt });
}
