import { describe, expect, it } from "vitest";
import { loadScenario, type Scenario } from "../src/sim/scenario";
import { buildPerfectPicture } from "../src/sim/sensors/picture";
import { length } from "../src/sim/vec3";
import holotableTest from "../src/data/scenarios/holotable-test.json";

const scenario = holotableTest as Scenario;

describe("scenario loading", () => {
  it("loads the holotable test scenario", () => {
    const world = loadScenario(scenario);
    expect(world.ships).toHaveLength(7);
    expect(world.torpedoes).toHaveLength(20);
    expect(world.bodies).toHaveLength(5);
    expect(world.stations).toHaveLength(1);
  });

  it("expands salvos deterministically from the seed", () => {
    const a = loadScenario(scenario);
    const b = loadScenario(scenario);
    expect(a.torpedoes).toEqual(b.torpedoes);
    const other = loadScenario({ ...scenario, seed: scenario.seed + 1 });
    expect(other.torpedoes[0].position).not.toEqual(a.torpedoes[0].position);
  });

  it("places salvo torpedoes within the spread and aims them at the aim point", () => {
    const world = loadScenario(scenario);
    const salvo = scenario.salvos![0];
    for (const t of world.torpedoes) {
      const d = { x: t.position.x - salvo.center.x, y: t.position.y - salvo.center.y, z: t.position.z - salvo.center.z };
      expect(length(d)).toBeLessThanOrEqual(salvo.spread);
      expect(length(t.heading)).toBeCloseTo(1, 9);
      // Heading points from the torpedo toward the aim point.
      const toAim = { x: -t.position.x, y: -t.position.y, z: -t.position.z };
      const cos = (toAim.x * t.heading.x + toAim.y * t.heading.y + toAim.z * t.heading.z) / length(toAim);
      expect(cos).toBeCloseTo(1, 9);
    }
  });

  it("does not share objects with the scenario data", () => {
    const world = loadScenario(scenario);
    world.ships[0].position.x = 123;
    expect(scenario.ships[0].position.x).toBe(0);
  });

  it("rejects duplicate ids and unknown factions", () => {
    const dup = { ...scenario, ships: [scenario.ships[0], scenario.ships[0]] };
    expect(() => loadScenario(dup)).toThrow(/duplicate/);
    const badFaction = { ...scenario, ships: [{ ...scenario.ships[0], faction: "nope" }] };
    expect(() => loadScenario(badFaction)).toThrow(/unknown faction/);
  });
});

describe("perfect sensor picture", () => {
  const world = loadScenario(scenario);
  const picture = buildPerfectPicture(world, "blue");

  it("lists own ships separately, never as tracks", () => {
    expect(picture.ownShips.map((s) => s.id).sort()).toEqual(["blue-cv2", "blue-dd3", "blue-ff1"]);
    expect(picture.tracks.some((t) => t.id.startsWith("blue-"))).toBe(false);
  });

  it("assigns allegiance from the viewer's point of view", () => {
    const byId = Object.fromEntries(picture.tracks.map((t) => [t.id, t]));
    expect(byId["red-cr1"].allegiance).toBe("hostile");
    expect(byId["red-t-01"].allegiance).toBe("hostile");
    expect(byId["grey-st1"].allegiance).toBe("neutral");
    expect(byId["grey-x1"].allegiance).toBe("unknown");
    expect(byId["grey-x1"].identified).toBe(false);
    expect(byId["grey-x1"].shipClass).toBeUndefined();

    const redView = buildPerfectPicture(world, "red");
    expect(redView.tracks.find((t) => t.id === "blue-ff1")!.allegiance).toBe("hostile");
  });

  it("records which own ships contribute to each track", () => {
    for (const t of picture.tracks) {
      expect(t.contributors.sort()).toEqual(["blue-cv2", "blue-dd3", "blue-ff1"]);
    }
  });

  it("reports burning vs coasting from thrust", () => {
    const byId = Object.fromEntries(picture.tracks.map((t) => [t.id, t]));
    expect(byId["red-cr1"].burning).toBe(true);
    expect(byId["red-cap1"].burning).toBe(false);
  });

  it("is a copy: changing the picture never changes the world", () => {
    picture.tracks[0].position.x = 999;
    picture.ownShips[0].position.x = 999;
    picture.bodies[0].position.x = 999;
    const fresh = buildPerfectPicture(world, "blue");
    expect(fresh.tracks[0].position.x).not.toBe(999);
    expect(fresh.ownShips[0].position.x).not.toBe(999);
    expect(fresh.bodies[0].position.x).not.toBe(999);
  });
});
