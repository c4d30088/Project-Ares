import { afterEach, describe, expect, it } from "vitest";
import { impactTuning as T } from "../src/data/impacts";
import { subsystemLabel } from "../src/data/names";
import { hitTextLines, impactsFromEvents, mergeHitText, type HitText, type ImpactContext } from "../src/render/impactModel";
import type { SimEvent } from "../src/sim/commands";
import { v3 } from "./helpers";

// Blue is the player. Red is hostile to blue; grey is neither.
const ctx: ImpactContext = {
  playerFaction: "blue",
  hostile: (a, b) => (a === "blue" && b === "red") || (a === "red" && b === "blue"),
  factionOf: (id) => ({ ff: "blue", enemy: "red", other: "grey" } as Record<string, string>)[id],
};

const damage = (over: Partial<Extract<SimEvent, { type: "damage" }>> = {}): SimEvent => ({
  type: "damage", ship: "enemy", faction: "red", attacker: "blue", subsystem: "sensors", side: "front", cause: "torpedo",
  position: v3(1, 2, 3), hull: 0.35, amount: 0.7, ...over,
});

const saved = { ...T, sparkScale: { ...T.sparkScale } };
afterEach(() => Object.assign(T, saved));

describe("explosions and sparks", () => {
  it("a torpedo warhead is a bloom in the color of the side that fired it", () => {
    const ours = impactsFromEvents([{ type: "torpedoDetonated", torpedo: "t", faction: "blue", hit: "enemy", position: v3(5, 0, 0) }], ctx);
    expect(ours.effects).toEqual([{ kind: "bloom", position: v3(5, 0, 0), color: "fireFriendly", scale: 1 }]);
    const theirs = impactsFromEvents([{ type: "torpedoDetonated", torpedo: "t", faction: "red", hit: "ff", position: v3(5, 0, 0) }], ctx);
    expect(theirs.effects[0].color).toBe("fireHostile");
    const third = impactsFromEvents([{ type: "torpedoDetonated", torpedo: "t", faction: "grey", hit: "ff", position: v3(5, 0, 0) }], ctx);
    expect(third.effects[0].color).toBe("neutral");
  });

  it("a PDC kill and a slug hit are sparks, the slug's bigger", () => {
    const kill = impactsFromEvents([{ type: "pdcKill", ship: "ff", faction: "blue", mount: 1, torpedo: "t", target: "torpedo", position: v3(0, 9, 0) }], ctx);
    const slug = impactsFromEvents([{ type: "slugHit", slug: "s", faction: "red", hit: "ff", position: v3(0, 8, 0) }], ctx);
    expect(kill.effects).toEqual([{ kind: "sparks", position: v3(0, 9, 0), color: "fireFriendly", scale: T.sparkScale.pdcKill }]);
    expect(slug.effects).toEqual([{ kind: "sparks", position: v3(0, 8, 0), color: "fireHostile", scale: T.sparkScale.slugHit }]);
    expect(T.sparkScale.slugHit).toBeGreaterThan(T.sparkScale.pdcKill);
  });

  it("PDC fire striking a ship makes sparks; a torpedo or slug hit does not add a second burst", () => {
    const pdc = impactsFromEvents([damage({ cause: "pdc" })], ctx);
    expect(pdc.effects).toHaveLength(1);
    expect(pdc.effects[0]).toMatchObject({ kind: "sparks", color: "fireFriendly", scale: T.sparkScale.pdcHit });
    expect(impactsFromEvents([damage({ cause: "torpedo" })], ctx).effects).toHaveLength(0);
    expect(impactsFromEvents([damage({ cause: "railgun" })], ctx).effects).toHaveLength(0);
  });

  it("a destroyed ship gets a big bloom and DESTROYED, colored for the side that won it", () => {
    const enemyDies = impactsFromEvents([{ type: "destroyed", id: "enemy", cause: "torpedo", kind: "ship", position: v3(1, 1, 1) }], ctx);
    expect(enemyDies.effects).toEqual([{ kind: "bloom", position: v3(1, 1, 1), color: "fireFriendly", scale: T.bloomShipKillScale }]);
    expect(enemyDies.texts[0]).toMatchObject({ shipId: "enemy", note: "DESTROYED", color: "fireFriendly" });
    const weDie = impactsFromEvents([{ type: "destroyed", id: "ff", cause: "torpedo", kind: "ship", position: v3(1, 1, 1) }], ctx);
    expect(weDie.effects[0].color).toBe("fireHostile");
    // Torpedoes and slugs ending are not ship kills.
    expect(impactsFromEvents([{ type: "destroyed", id: "t", cause: "pdc", kind: "torpedo", position: v3(0, 0, 0) }], ctx).effects).toEqual([]);
  });
});

describe("hit text", () => {
  it("says what the hit took, colored by whose weapon it was", () => {
    const [t] = impactsFromEvents([damage()], ctx).texts;
    expect(t).toMatchObject({ shipId: "enemy", color: "fireFriendly", hull: 0.35, subsystems: [["sensors", 0.7]], note: null });
    expect(hitTextLines(t)).toEqual(["HULL -35%", "SENSORS -70%"]);
    const [theirs] = impactsFromEvents([damage({ ship: "ff", attacker: "red" })], ctx).texts;
    expect(theirs.color).toBe("fireHostile");
  });

  it("shows only the hull when no subsystem was struck, and never rounds a real hit down to 0%", () => {
    const [t] = impactsFromEvents([damage({ subsystem: "hull", amount: 0, hull: 0.004 })], ctx).texts;
    expect(hitTextLines(t)).toEqual(["HULL -1%"]);
  });

  it("names the subsystem that went offline", () => {
    const [a] = impactsFromEvents([{ type: "subsystemDestroyed", ship: "enemy", subsystem: "railgun", position: v3(0, 0, 0) }], ctx).texts;
    expect(hitTextLines(a)).toEqual(["RAILGUN OFFLINE"]);
    expect(subsystemLabel("pdc2")).toBe("PDC 2");
    // Something lost on the enemy is our win (green); on our ship, theirs (yellow).
    expect(a.color).toBe("fireFriendly");
    const [b] = impactsFromEvents([{ type: "subsystemDestroyed", ship: "ff", subsystem: "drive", position: v3(0, 0, 0) }], ctx).texts;
    expect(b.color).toBe("fireHostile");
  });

  it("can be limited to enemy ships or switched off", () => {
    T.hitTextOnOwn = false;
    expect(impactsFromEvents([damage({ ship: "ff", attacker: "red" })], ctx).texts).toHaveLength(0);
    expect(impactsFromEvents([damage()], ctx).texts).toHaveLength(1);
    T.showHitText = false;
    expect(impactsFromEvents([damage()], ctx).texts).toHaveLength(0);
  });

  it("adds up quick hits on one ship into one label, but not across ships, colors or notes", () => {
    const hit = (over: Partial<HitText> = {}): HitText => ({ shipId: "ff", position: v3(0, 0, 0), color: "fireHostile", hull: 0.03, subsystems: [["pdc1", 0.15]], note: null, ...over });
    const merged = mergeHitText(hit(), hit({ subsystems: [["pdc1", 0.15], ["drive", 0.1]] }));
    expect(merged).not.toBeNull();
    expect(merged!.hull).toBeCloseTo(0.06, 9);
    expect(hitTextLines(merged!)).toEqual(["HULL -6%", "PDC 1 -30%", "DRIVE -10%"]);
    expect(mergeHitText(hit(), hit({ shipId: "enemy" }))).toBeNull();
    expect(mergeHitText(hit(), hit({ color: "fireFriendly" }))).toBeNull();
    expect(mergeHitText(hit(), hit({ note: "DESTROYED" }))).toBeNull();
  });
});
