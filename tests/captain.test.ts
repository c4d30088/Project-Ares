// The AI captain: scores a few behaviors from its own side's picture and acts only
// through commands. The scoring is pure, so most of it is tested directly; a few short
// fights check the behaviors end to end.

import { describe, expect, it } from "vitest";
import { personalityPresets, type Personality } from "../src/data/ai";
import { captainParams, chooseMode, coverPoint, scoreBehaviors, type Situation } from "../src/sim/ai/captain";
import { segmentHitsSphere } from "../src/sim/collide";
import { loadScenario, type Scenario } from "../src/sim/scenario";
import { DT, step } from "../src/sim/sim";
import { length, sub } from "../src/sim/vec3";
import type { CaptainScript, Torpedo, World } from "../src/sim/world";

const calm: Situation = {
  hull: 1,
  dry: false,
  gunOutOfArc: false,
  inbound: { count: 0, soonestS: Infinity },
  inEnemyRange: false,
  coverAvailable: false,
};
const { hunter, duelist, skulker } = personalityPresets;

describe("personality", () => {
  it("aggression presses closer, fires bigger salvos more often, retreats later", () => {
    const h = captainParams(hunter);
    const s = captainParams(skulker);
    expect(h.holdRange).toBeLessThan(s.holdRange);
    expect(h.salvoSize).toBeGreaterThan(s.salvoSize);
    expect(h.salvoGapS).toBeLessThan(s.salvoGapS);
    expect(h.retreatHull).toBeLessThan(s.retreatHull);
  });

  it("emissions discipline raises the share of cold launches", () => {
    expect(captainParams(skulker).coldEvery).toBeLessThan(captainParams(hunter).coldEvery);
    expect(captainParams({ aggression: 0.5, caution: 0.5, emissionsDiscipline: 0 }).coldEvery).toBe(0);
  });
});

describe("behavior scores", () => {
  const pick = (sit: Situation, p: Personality, current = null as Parameters<typeof chooseMode>[1]) => chooseMode(scoreBehaviors(sit, p), current);

  it("holds its range when nothing is wrong", () => {
    expect(pick(calm, duelist)).toBe("station");
  });

  it("turns the ship to bring the railgun to bear", () => {
    expect(pick({ ...calm, gunOutOfArc: true }, duelist)).toBe("orient");
  });

  it("retreats when badly damaged, and a cautious captain does so sooner", () => {
    const hurt = { ...calm, hull: 0.4 };
    expect(pick(hurt, skulker)).toBe("retreat");
    expect(pick(hurt, hunter)).toBe("station");
    expect(pick({ ...calm, hull: 0.1 }, hunter)).toBe("retreat");
  });

  it("retreats when it has nothing left to shoot", () => {
    expect(pick({ ...calm, dry: true }, hunter)).toBe("retreat");
  });

  it("evades torpedoes about to land, if it is cautious enough", () => {
    const soon = { ...calm, inbound: { count: 4, soonestS: 15 } };
    expect(pick(soon, skulker)).toBe("evade");
    expect(pick(soon, hunter)).toBe("station");
  });

  it("ignores torpedoes that are still far off", () => {
    expect(scoreBehaviors({ ...calm, inbound: { count: 4, soonestS: 400 } }, skulker).evade).toBe(0);
  });

  it("takes cover when exposed and cautious; an aggressive captain does not bother", () => {
    const exposed = { ...calm, inEnemyRange: true, coverAvailable: true };
    expect(pick(exposed, skulker)).toBe("cover");
    expect(pick(exposed, hunter)).toBe("station");
    expect(scoreBehaviors({ ...calm, inEnemyRange: false, coverAvailable: true }, skulker).cover).toBe(0);
  });

  it("keeps its current behavior unless another clearly beats it", () => {
    const scores = { station: 0.5, orient: 0.55, evade: 0, retreat: 0, cover: 0 };
    expect(chooseMode(scores, "station")).toBe("station");
    expect(chooseMode(scores, null)).toBe("orient");
    expect(chooseMode({ ...scores, orient: 0.9 }, "station")).toBe("orient");
  });

  it("a gun that cannot bear always wins the switch from holding station", () => {
    const scores = scoreBehaviors({ ...calm, gunOutOfArc: true }, duelist);
    expect(chooseMode(scores, "station")).toBe("orient");
  });

  it("the cover point puts the body between the ship and the enemy", () => {
    const body = { position: { x: 0, y: 0, z: 0 }, radius: 1000 };
    const enemy = { x: -50_000, y: 0, z: 0 };
    const p = coverPoint(body, enemy);
    expect(p.x).toBeGreaterThan(1000);
    expect(segmentHitsSphere(p, enemy, body.position, body.radius)).toBe(true);
  });
});

/** Blue (the "player") against one red captain; a moon near red if asked for. */
function duel(opts: { red?: keyof typeof personalityPresets; blueAi?: keyof typeof personalityPresets; range?: number; moon?: boolean; torpedo?: Torpedo } = {}): World {
  const range = opts.range ?? 7e6;
  const scenario: Scenario = {
    name: "duel",
    seed: 7,
    playerFaction: "blue",
    factions: [
      { id: "blue", name: "B", hostileTo: ["red"] },
      { id: "red", name: "R", hostileTo: ["blue"] },
    ],
    ships: [
      { id: "blue-1", name: "B1", faction: "blue", shipClass: "frigate", position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
      { id: "red-1", name: "R1", faction: "red", shipClass: "frigate", position: { x: range, y: 0, z: 0 }, velocity: { x: -300, y: 0, z: 0 } },
    ],
    bodies: opts.moon ? [{ id: "moon", name: "M", kind: "moon", position: { x: range - 500_000, y: 500_000, z: 0 }, radius: 150_000 }] : [],
    torpedoes: opts.torpedo ? [opts.torpedo] : [],
    ai: [
      { ship: "red-1", behavior: "captain", personality: opts.red ?? "duelist" },
      ...(opts.blueAi ? [{ ship: "blue-1", behavior: "captain" as const, personality: opts.blueAi }] : []),
    ],
  };
  return loadScenario(scenario);
}
const run = (w: World, s: number) => {
  for (let i = 0; i < s / DT; i++) step(w);
};
const dist = (w: World) => length(sub(w.ships.find((s) => s.id === "blue-1")!.position, w.ships.find((s) => s.id === "red-1")!.position));
const captain = (w: World, ship = "red-1") => w.ai.find((a) => a.ship === ship) as CaptainScript;

describe("captain in a fight", () => {
  it("acts only through commands from its own side", () => {
    const w = duel();
    const seen: string[] = [];
    for (let i = 0; i < 60 / DT; i++) {
      for (const q of w.pending) seen.push(`${q.faction}:${q.command.type}:${q.command.ship}`);
      step(w);
    }
    expect(seen.some((x) => x.startsWith("red:burnTo:red-1"))).toBe(true);
    expect(seen.every((x) => x.startsWith("red:"))).toBe(true);
  });

  it("an aggressive captain closes further than a timid one", () => {
    const h = duel({ red: "hunter" });
    const s = duel({ red: "skulker" });
    run(h, 800);
    run(s, 800);
    expect(dist(h)).toBeLessThan(dist(s));
  });

  it("fires torpedo salvos once the target is inside its range", () => {
    const w = duel({ red: "hunter" });
    let launches = 0;
    let firstAt = Infinity;
    for (let i = 0; i < 700 / DT; i++) {
      step(w);
      for (const e of w.events) {
        if (e.type === "torpedoLaunched" && e.faction === "red") {
          launches++;
          firstAt = Math.min(firstAt, dist(w));
        }
      }
    }
    expect(launches).toBeGreaterThan(0);
    expect(firstAt).toBeLessThan(3_100_000);
  });

  it("out of torpedoes, closes in and fights with the railgun", () => {
    const w = duel({ red: "hunter" });
    w.ships.find((s) => s.id === "red-1")!.weapons.magazine = 0;
    let fired = false;
    for (let i = 0; i < 2500 / DT && !fired; i++) {
      step(w);
      fired = w.events.some((e) => e.type === "railgunFired" && e.faction === "red");
    }
    expect(fired).toBe(true);
    expect(dist(w)).toBeLessThan(400_000);
  });

  it("retreats when badly damaged: breaks off and opens the range", () => {
    const w = duel({ range: 2e6 });
    w.ships.find((s) => s.id === "red-1")!.health.hull = 0.1;
    run(w, 5);
    expect(captain(w).state.mode).toBe("retreat");
    const before = dist(w);
    run(w, 120);
    expect(dist(w)).toBeGreaterThan(before);
  });

  it("in a gun fight with no torpedoes left it holds its ground instead of backing away and turning back", () => {
    const w = duel({ red: "hunter", range: 150_000 });
    w.ships.find((s) => s.id === "red-1")!.weapons.magazine = 0;
    w.ships.find((s) => s.id === "red-1")!.velocity = { x: 0, y: 0, z: 0 };
    const modes: (string | null)[] = [];
    let farthest = 0;
    for (let i = 0; i < 120 / DT && w.ships.length === 2; i++) {
      step(w);
      if (i % Math.round(1 / DT) === 0 && w.ships.length === 2) {
        modes.push(captain(w).state.mode);
        farthest = Math.max(farthest, dist(w));
      }
    }
    const changes = modes.filter((m, i) => i > 0 && m !== modes[i - 1]).length;
    expect(modes.length).toBeGreaterThan(20);
    expect(changes).toBeLessThanOrEqual(2);
    expect(farthest).toBeLessThan(200_000);
  });

  it("a retreating captain eases off to Cruise G once its crew is strained", () => {
    const w = duel({ range: 2e6 });
    const red = w.ships.find((s) => s.id === "red-1")!;
    red.health.hull = 0.1;
    red.strain = 0.9;
    run(w, 5);
    expect(red.g).toBe("cruise");
  });

  it("a cautious captain evades torpedoes about to land; an aggressive one does not", () => {
    const incoming: Torpedo = {
      id: "t-in",
      faction: "blue",
      position: { x: 7e6 - 250_000, y: 0, z: 0 },
      velocity: { x: 3_000, y: 0, z: 0 },
      heading: { x: 1, y: 0, z: 0 },
      thrust: 0,
      guidance: { target: { kind: "track", id: "red-1" }, launcher: "blue-1", mode: "hot", stage: "flight", fuel: 12_000, reserve: 3_000, searchS: 0 },
    };
    // Put the torpedo on a collision course with red: it is flying at red from 250 km, closing at 3 km/s plus red's 300 m/s.
    const s = duel({ red: "skulker", torpedo: { ...incoming, position: { x: 7e6 - 250_000, y: 0, z: 0 }, velocity: { x: 3_000, y: 0, z: 0 } } });
    const h = duel({ red: "hunter", torpedo: { ...incoming, position: { x: 7e6 - 250_000, y: 0, z: 0 }, velocity: { x: 3_000, y: 0, z: 0 } } });
    run(s, 2);
    run(h, 2);
    expect(captain(s).state.mode).toBe("evade");
    expect(captain(h).state.mode).not.toBe("evade");
    expect(s.ships.find((x) => x.id === "red-1")!.g).toBeDefined();
  });

  it("a cautious captain hides behind a nearby body", () => {
    const w = duel({ red: "skulker", range: 2.4e6, moon: true });
    run(w, 900);
    const me = w.ships.find((x) => x.id === "red-1")!;
    const enemy = w.ships.find((x) => x.id === "blue-1")!;
    const moon = w.bodies[0];
    expect(captain(w).state.mode).toBe("cover");
    expect(segmentHitsSphere(me.position, enemy.position, moon.position, moon.radius)).toBe(true);
  });

  it("two captains fight to the same result twice", () => {
    const play = () => {
      const w = duel({ red: "duelist", blueAi: "hunter", range: 5e6 });
      run(w, 700);
      return JSON.stringify(w);
    };
    expect(play()).toBe(play());
  });

  it("coasts when it sees no enemy", () => {
    const w = duel();
    w.ships = w.ships.filter((s) => s.id === "red-1");
    run(w, 5);
    expect(captain(w).state.mode).toBeNull();
  });
});
