import { describe, expect, it } from "vitest";
import { buildDisplayList } from "../src/render/displayList";
import { loadScenario, type Scenario } from "../src/sim/scenario";
import { buildPerfectPicture } from "../src/sim/sensors/picture";
import holotableTest from "../src/data/scenarios/holotable-test.json";

const world = loadScenario(holotableTest as Scenario);
const list = buildDisplayList(buildPerfectPicture(world, "blue"));
const byId = Object.fromEntries(list.symbols.map((s) => [s.id, s]));

describe("display list", () => {
  it("has one symbol per own ship and track, and every body", () => {
    expect(list.symbols).toHaveLength(3 + 4 + 20 + 1);
    expect(list.bodies).toHaveLength(5);
  });

  it("uses the class shape for identified ships and the unknown shape otherwise", () => {
    expect(byId["blue-ff1"].shape).toBe("frigate");
    expect(byId["red-cap1"].shape).toBe("capital");
    expect(byId["grey-x1"].shape).toBe("unknown");
    expect(byId["grey-x1"].allegiance).toBe("unknown");
    expect(byId["grey-st1"].shape).toBe("station");
    expect(byId["red-t-01"].shape).toBe("torpedo");
  });

  it("fills burning ships and leaves coasting ships hollow, for every allegiance", () => {
    expect(byId["blue-ff1"].filled).toBe(true); // own, burning
    expect(byId["blue-cv2"].filled).toBe(false); // own, coasting
    expect(byId["red-cr1"].filled).toBe(true); // hostile, burning
    expect(byId["red-cap1"].filled).toBe(false); // hostile, coasting
  });

  it("points burning ships along thrust and coasting ships along velocity", () => {
    const cruiser = world.ships.find((s) => s.id === "red-cr1")!;
    expect(byId["red-cr1"].pointing).toEqual(cruiser.heading);
    const capital = world.ships.find((s) => s.id === "red-cap1")!;
    expect(byId["red-cap1"].pointing).toEqual(capital.velocity);
  });

  it("does not label individual torpedoes", () => {
    expect(byId["red-t-01"].label).toBeNull();
    expect(byId["red-cr1"].label).toBe("TRK-11 CRUISER");
  });
});
