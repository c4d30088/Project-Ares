import { describe, expect, it } from "vitest";
import { maxAccel } from "../src/sim/autopilot";
import { closestApproach, segmentHitsSphere } from "../src/sim/collide";
import { applyHit, hitSide, sectorCandidates } from "../src/sim/damage";
import { DT, step } from "../src/sim/sim";
import { makeShip, makeWorld, v3 } from "./helpers";

describe("hit detection", () => {
  it("finds the closest approach of two movers within a tick", () => {
    // A passes B side by side, 10 m apart, crossing at mid-tick.
    const r = closestApproach(v3(-500, 0, 0), v3(500, 0, 0), v3(0, 10, 0), v3(0, 10, 0));
    expect(r.dist).toBeCloseTo(10, 6);
    expect(r.t).toBeCloseTo(0.5, 6);
  });

  it("catches a fast segment passing through a sphere between ticks", () => {
    expect(segmentHitsSphere(v3(-1000, 0, 0), v3(1000, 0, 0), v3(0, 5, 0), 10)).toBe(true);
    expect(segmentHitsSphere(v3(-1000, 0, 0), v3(1000, 0, 0), v3(0, 50, 0), 10)).toBe(false);
  });
});

describe("subsystem damage by hit direction", () => {
  // Ship points along +X (forward), left is +Y, up is +Z.
  const ship = () => makeShip({ id: "a", heading: v3(1, 0, 0) });

  it("knows which side a hit came from", () => {
    const s = ship();
    expect(hitSide(s, v3(1, 0.1, 0))).toBe("front");
    expect(hitSide(s, v3(-1, 0, 0.2))).toBe("rear");
    expect(hitSide(s, v3(0, 1, 0))).toBe("left");
    expect(hitSide(s, v3(0, -1, 0))).toBe("right");
    expect(hitSide(s, v3(0, 0, 1))).toBe("top");
  });

  it("front hits strike forward systems; rear hits strike the drive and reactor", () => {
    const s = ship();
    expect(sectorCandidates(s, "front").map(([id]) => id).sort()).toEqual(["crew", "railgun", "sensors", "tubes"]);
    expect(sectorCandidates(s, "rear").map(([id]) => id).sort()).toEqual(["drive", "radiators", "reactor"]);
    // Side hits can only strike PDC mounts on that side.
    const leftPdcs = sectorCandidates(s, "left").filter(([id]) => id.startsWith("pdc"));
    expect(leftPdcs.length).toBeGreaterThan(0);
    expect(leftPdcs.length).toBeLessThan(4);
  });

  it("a hit from behind damages hull and a rear subsystem", () => {
    const s = ship();
    const world = makeWorld([s]);
    applyHit(world, s, v3(-1, 0, 0), 0.3, 0.5, "test", "x");
    expect(s.health.hull).toBeCloseTo(0.7, 9);
    const rear = ["drive", "reactor", "radiators"].filter((id) => s.health[id] < 1);
    expect(rear).toHaveLength(1);
    expect(world.events).toContainEqual(expect.objectContaining({ type: "damage", side: "rear" }));
  });

  it("drive damage caps acceleration", () => {
    const s = ship();
    const full = maxAccel(s);
    s.health.drive = 0.5;
    expect(maxAccel(s)).toBeCloseTo(full * 0.5, 9);
  });

  it("zero hull destroys the ship and removes it at the end of the tick", () => {
    const s = ship();
    const world = makeWorld([s, makeShip({ id: "b", faction: "red", position: v3(1e6, 0, 0) })]);
    applyHit(world, s, v3(1, 0, 0), 1.0, 0.1, "test", "x");
    expect(s.destroyed).toBe(true);
    expect(world.events).toContainEqual(expect.objectContaining({ type: "destroyed", id: "a" }));
    step(world);
    expect(world.ships.map((x) => x.id)).toEqual(["b"]);
  });

  it("the same seed picks the same subsystems (determinism)", () => {
    const run = () => {
      const s = ship();
      const world = makeWorld([s]);
      for (let i = 0; i < 6; i++) applyHit(world, s, v3(0, 1, 0), 0.01, 0.2, "test", "x");
      return s.health;
    };
    expect(run()).toEqual(run());
  });
});

describe("collisions with bodies", () => {
  it("a ship that flies into a moon is destroyed", () => {
    const s = makeShip({ id: "a", position: v3(-2_000_000, 0, 0), velocity: v3(20_000, 0, 0) });
    const world = makeWorld([s]);
    world.bodies.push({ id: "m", name: "M", kind: "moon", position: v3(0, 0, 0), radius: 1_000_000 });
    let destroyed = false;
    for (let i = 0; i < 100 / DT && !destroyed; i++) {
      step(world);
      destroyed = world.events.some((e) => e.type === "destroyed" && e.id === "a");
    }
    expect(destroyed).toBe(true);
    expect(world.ships).toHaveLength(0);
  });
});
