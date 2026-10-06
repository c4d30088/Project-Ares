import { afterEach, describe, expect, it } from "vitest";
import { pathTuning } from "../src/data/paths";
import { pdcTuning, railgunTuning, torpedoTuning } from "../src/data/weapons";
import { weaponRings } from "../src/render/weaponRings";
import { loadScenario, type Scenario } from "../src/sim/scenario";
import { buildPerfectPicture } from "../src/sim/sensors/picture";
import holotableTest from "../src/data/scenarios/holotable-test.json";

const fmt = (m: number) => `${Math.round(m / 1000)} km`;
const rings = (world: ReturnType<typeof loadScenario>, selectedId: string | null = null, aiming: string | null = null) =>
  weaponRings(buildPerfectPicture(world, "blue"), { selectedId, aimingTorpedoesFrom: aiming, formatDistance: fmt });
const keys = (r: ReturnType<typeof rings>) => r.map((x) => x.key).sort();

afterEach(() => {
  pathTuning.showOwnRings = true;
  pathTuning.showEnemyRings = true;
});

describe("weapon range rings", () => {
  it("draws torpedo, railgun and PDC rings for each of our ships, by what it carries", () => {
    const world = loadScenario(holotableTest as Scenario);
    const r = rings(world);
    const ff = r.filter((x) => x.shipId === "blue-ff1");
    expect(ff.map((x) => x.weapon).sort()).toEqual(["pdc", "railgun", "torpedo"]);
    expect(ff.find((x) => x.weapon === "torpedo")!.radius).toBe(torpedoTuning.effectiveRange);
    expect(ff.find((x) => x.weapon === "railgun")!.radius).toBe(railgunTuning.light.effectiveRange);
    expect(ff.find((x) => x.weapon === "pdc")!.radius).toBe(pdcTuning.effectiveRange);
    // A corvette has no railgun.
    expect(r.filter((x) => x.shipId === "blue-cv2").map((x) => x.weapon).sort()).toEqual(["pdc", "torpedo"]);
    expect(r.every((x) => x.allegiance === "friendly")).toBe(true);
    expect(ff.find((x) => x.weapon === "railgun")!.dashed).toBe(true);
  });

  it("drops the ring of a weapon that is destroyed or empty", () => {
    const world = loadScenario(holotableTest as Scenario);
    const ff = world.ships.find((s) => s.id === "blue-ff1")!;
    ff.health.railgun = 0;
    ff.weapons.magazine = 0;
    const r = rings(world).filter((x) => x.shipId === "blue-ff1");
    expect(r.map((x) => x.weapon)).toEqual(["pdc"]);
  });

  it("shows a selected enemy's rings in the hostile color, from its class", () => {
    const world = loadScenario(holotableTest as Scenario);
    const r = rings(world, "red-cr1").filter((x) => x.shipId === "red-cr1");
    expect(r.map((x) => x.weapon).sort()).toEqual(["pdc", "railgun", "torpedo"]);
    expect(r.every((x) => x.allegiance === "hostile")).toBe(true);
    // A cruiser carries a spinal gun.
    expect(r.find((x) => x.weapon === "railgun")!.radius).toBe(railgunTuning.spinal.effectiveRange);
  });

  it("shows no rings for unselected enemies or unidentified contacts", () => {
    const world = loadScenario(holotableTest as Scenario);
    expect(rings(world).some((x) => x.allegiance !== "friendly")).toBe(false);
    expect(rings(world, "grey-x1").some((x) => x.shipId === "grey-x1")).toBe(false);
  });

  it("hides our rings when turned off, except the torpedo ring while aiming", () => {
    const world = loadScenario(holotableTest as Scenario);
    pathTuning.showOwnRings = false;
    expect(rings(world)).toEqual([]);
    expect(keys(rings(world, null, "blue-ff1"))).toEqual(["blue-ff1:torpedo"]);
    pathTuning.showOwnRings = true;
    const aimed = rings(world, null, "blue-ff1").find((x) => x.key === "blue-ff1:torpedo")!;
    expect(aimed.opacity).toBe(pathTuning.rangeRingAimOpacity);
  });
});
