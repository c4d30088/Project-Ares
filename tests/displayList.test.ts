import { describe, expect, it } from "vitest";
import { buildDisplayList } from "../src/render/displayList";
import { loadScenario, type Scenario } from "../src/sim/scenario";
import { buildPerfectPicture } from "../src/sim/sensors/picture";
import holotableTest from "../src/data/scenarios/holotable-test.json";

const world = loadScenario(holotableTest as Scenario);
// Drive state comes from the sim; set it directly so the display mapping can be checked.
const setThrust = (id: string, a: number) => (world.ships.find((s) => s.id === id)!.thrust = a);
setThrust("blue-ff1", 19.6);
setThrust("red-cr1", 14.7);
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

describe("torpedo intercept overlays", () => {
  it("draws a line per torpedo and one X per target, counting the salvo", async () => {
    const { makeShip, makeWorld, v3 } = await import("./helpers");
    const { step, submit } = await import("../src/sim/sim");
    const { torpedoOverlays } = await import("../src/render/displayList");
    const w = makeWorld([makeShip({ id: "ff" }), makeShip({ id: "tgt", faction: "red", position: v3(3_000_000, 0, 0) })]);
    submit(w, "red", { type: "launchTorpedoes", ship: "tgt", target: { kind: "track", id: "ff" }, count: 2, mode: "hot" });
    submit(w, "blue", { type: "launchTorpedoes", ship: "ff", target: { kind: "track", id: "tgt" }, count: 1, mode: "hot" });
    for (let i = 0; i < 40; i++) step(w);
    const o = torpedoOverlays(buildPerfectPicture(w, "blue"));
    expect(o.lines).toHaveLength(3);
    expect(o.lines.filter((l) => l.hostile)).toHaveLength(2);
    expect(o.markers).toHaveLength(2);
    const incoming = o.markers.find((m) => m.allegiance === "hostile")!;
    expect(incoming.label).toMatch(/^T-\d\d:\d\d \u00d72$/);
  });
});
