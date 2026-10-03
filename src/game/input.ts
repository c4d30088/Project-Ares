// Order input: turns button presses, keys and clicks on the table into Commands for the
// player's active ship.
//
// Point placement (DESIGN.md section 6): press on the reference plane to set the
// horizontal position, drag up or down to set the height, release to confirm. Pressing on
// a ship or body snaps to it. No modifier key is needed, because the camera does not
// rotate while an order is being placed (right-drag still pans). Esc cancels.

import * as THREE from "three";
import type { Target } from "../sim/target";
import type { Vec3 } from "../sim/vec3";
import type { GSetting } from "../sim/world";
import { formatDistance } from "../ui/format";
import { fromRender } from "../render/frame";
import type { TableView } from "../render/scene";
import type { Game } from "./game";

export type OrderKind = "burnTo" | "rendezvous" | "fastPass" | "match" | "stationKeep" | "orient" | "coast";

/** How each order picks what it applies to. */
const NEEDS: Record<OrderKind, "point" | "target" | "pointOrTarget" | "none"> = {
  burnTo: "point",
  rendezvous: "target",
  fastPass: "target",
  match: "target",
  stationKeep: "pointOrTarget",
  orient: "pointOrTarget",
  coast: "none",
};

const HINTS: Record<"point" | "target" | "pointOrTarget", string> = {
  point: "PRESS ON THE PLANE · DRAG UP OR DOWN FOR HEIGHT · RELEASE TO CONFIRM · ESC CANCELS",
  target: "CLICK A SHIP OR OBJECT · ESC CANCELS",
  pointOrTarget: "CLICK A SHIP OR OBJECT, OR PRESS ON THE PLANE AND DRAG FOR HEIGHT · ESC CANCELS",
};

export interface PlacementPreview {
  position: Vec3;
  label: string;
}

/** A placed point stays on the table until its route is drawn, or this many seconds. */
const PLACED_TIMEOUT_S = 10;
/** Orders without a route (orient) show the placed point this long. */
const PLACED_BRIEF_S = 1.5;

export interface OrderInput {
  readonly mode: OrderKind | null;
  readonly hint: string | null;
  readonly preview: PlacementPreview | null;
  start(kind: OrderKind): void;
  cancel(): void;
  setG(g: GSetting): void;
  /** Call once per frame: clears the placed point once its route has appeared. */
  update(): void;
}

export function createOrderInput(game: Game, view: TableView, pick: (x: number, y: number) => string | null): OrderInput {
  const dom = view.dom;
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  let mode: OrderKind | null = null;
  let ground: Vec3 | null = null; // horizontal position on the plane, sim coords
  let height = 0; // meters above (+) or below (-) the plane
  let dragging = false;
  let lastY = 0;
  // The last placed point, kept visible until the route for it is ready.
  let placed: { preview: PlacementPreview; ship: string; kind: OrderKind; at: number } | null = null;

  const local = (e: PointerEvent) => {
    const r = dom.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  function groundAt(x: number, y: number, w: number, h: number): Vec3 | null {
    raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), view.cam.camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return fromRender(hit.x, hit.y, hit.z, view.cam.focus);
  }

  function targetFor(id: string): Target {
    return game.picture.tracks.some((t) => t.id === id) ? { kind: "track", id } : { kind: "object", id };
  }

  function issuePoint(point: Vec3) {
    const ship = game.activeShipId;
    if (!ship || !mode) return;
    const preview = currentPreview();
    if (preview) placed = { preview: { ...preview, position: point }, ship, kind: mode, at: performance.now() };
    if (mode === "burnTo") game.issue({ type: "burnTo", ship, point });
    if (mode === "stationKeep") game.issue({ type: "stationKeep", ship, target: { kind: "point", position: point } });
    if (mode === "orient") game.issue({ type: "orient", ship, target: { kind: "point", position: point } });
    finish();
  }

  function issueTarget(id: string) {
    const ship = game.activeShipId;
    if (!ship || !mode || id === ship) return;
    const target = targetFor(id);
    switch (mode) {
      case "burnTo": {
        const p = game.positionOf(id);
        if (p) game.issue({ type: "burnTo", ship, point: { ...p } });
        break;
      }
      case "rendezvous":
        game.issue({ type: "intercept", ship, target, mode: "rendezvous" });
        break;
      case "fastPass":
        game.issue({ type: "intercept", ship, target, mode: "fastPass" });
        break;
      case "match":
        game.issue({ type: "matchVelocity", ship, target });
        break;
      case "stationKeep":
        game.issue({ type: "stationKeep", ship, target });
        break;
      case "orient":
        game.issue({ type: "orient", ship, target });
        break;
    }
    finish();
  }

  function currentPreview(): PlacementPreview | null {
    if (!mode || !ground || NEEDS[mode] === "target") return null;
    const position = { x: ground.x, y: ground.y, z: ground.z + height };
    const shipPos = game.activeShipId ? game.positionOf(game.activeShipId) : null;
    const range = shipPos ? Math.hypot(position.x - shipPos.x, position.y - shipPos.y, position.z - shipPos.z) : 0;
    const h = Math.abs(height) < 1 ? "ON PLANE" : `${height > 0 ? "+" : "\u2212"}${formatDistance(Math.abs(height))}`;
    return { position, label: `${formatDistance(range)} · ${h}` };
  }

  function finish() {
    mode = null;
    ground = null;
    height = 0;
    dragging = false;
    view.cam.leftDragEnabled = true;
    dom.style.cursor = "";
  }

  dom.addEventListener("pointermove", (e) => {
    if (!mode) return;
    const { x, y, w, h } = local(e);
    if (dragging && ground) {
      // Height from vertical mouse movement, scaled to the distance of the point.
      const camDist = view.cam.camera.position.distanceTo(
        new THREE.Vector3(ground.x - view.cam.focus.x, ground.z - view.cam.focus.z, -(ground.y - view.cam.focus.y)),
      );
      const metersPerPx = (2 * camDist * Math.tan((view.cam.camera.fov * Math.PI) / 360)) / h;
      height -= (y - lastY) * metersPerPx;
      lastY = y;
    } else if (NEEDS[mode] !== "target") {
      ground = groundAt(x, y, w, h);
    }
  });

  dom.addEventListener("pointerdown", (e) => {
    if (!mode || e.button !== 0) return;
    const { x, y, w, h } = local(e);
    const id = pick(x, y);
    if (id && id !== game.activeShipId) {
      issueTarget(id);
      return;
    }
    if (NEEDS[mode] === "target") return;
    ground = groundAt(x, y, w, h);
    if (!ground) return;
    dragging = true;
    height = 0;
    lastY = y;
  });

  dom.addEventListener("pointerup", (e) => {
    if (!mode || e.button !== 0 || !dragging || !ground) return;
    issuePoint({ x: ground.x, y: ground.y, z: ground.z + height });
  });

  return {
    get mode() {
      return mode;
    },
    get hint() {
      return mode && NEEDS[mode] !== "none" ? HINTS[NEEDS[mode] as keyof typeof HINTS] : null;
    },
    get preview() {
      return currentPreview() ?? placed?.preview ?? null;
    },
    update() {
      if (!placed) return;
      const age = (performance.now() - placed.at) / 1000;
      if (age > PLACED_TIMEOUT_S || (placed.kind === "orient" && age > PLACED_BRIEF_S)) {
        placed = null;
        return;
      }
      // The route is ready once a finished prediction ends near the placed point.
      const p = game.predictions.get(placed.ship);
      if (p?.done && p.arrival) {
        const a = p.arrival.position, b = placed.preview.position;
        const off = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (off < 5000) placed = null;
      }
    },
    start(kind) {
      const ship = game.activeShipId;
      if (!ship) return;
      placed = null;
      if (kind === "coast") {
        game.issue({ type: "coast", ship });
        finish();
        return;
      }
      mode = kind;
      ground = null;
      height = 0;
      dragging = false;
      view.cam.leftDragEnabled = false;
      dom.style.cursor = "crosshair";
    },
    cancel: finish,
    setG(g) {
      const ship = game.activeShipId;
      if (ship) game.issue({ type: "setG", ship, g });
    },
  };
}
