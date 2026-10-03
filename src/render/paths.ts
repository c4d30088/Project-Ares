// Predicted paths: solid where the ship will be burning, dashed where it will coast
// (DESIGN.md section 12, line language).
//
// Each path's geometry is built relative to its own origin (the first predicted point) and
// rebuilt only when the prediction changes or the ship has moved past more of it, at most
// a few times per second. Every frame the objects are just moved relative to the camera
// focus (floating origin). Geometry is always created fresh: three.js does not reliably
// pick up new positions on an existing thick-line geometry.

import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { pathTuning as T } from "../data/paths";
import type { Prediction } from "../sim/predict";
import type { Vec3 } from "../sim/vec3";
import { toRender } from "./frame";
import { palette } from "./palette";

/** Minimum real seconds between rebuilds of one path as the ship moves along it. */
const REBUILD_INTERVAL_S = 0.1;

interface PathObjects {
  solid: LineSegments2;
  dashed: LineSegments2;
  lead: LineSegments2;
  prediction: Prediction | null;
  pointCount: number;
  firstIndex: number;
  builtAt: number;
  origin: Vec3;
}

function replaceGeometry(line: LineSegments2, positions: number[]) {
  line.geometry.dispose();
  const g = new LineSegmentsGeometry();
  if (positions.length) g.setPositions(positions);
  line.geometry = g;
  line.visible = positions.length > 0;
}

export function createPathLayer(scene: THREE.Scene) {
  const solidMat = new LineMaterial({ color: palette.friendly, linewidth: T.burnWidthPx, transparent: true, depthWrite: false });
  const dashedMat = new LineMaterial({ color: palette.friendly, linewidth: T.coastWidthPx, transparent: true, depthWrite: false, dashed: true });
  const objects = new Map<string, PathObjects>();
  const v = new THREE.Vector3();
  let clock = 0;

  function objectsFor(id: string): PathObjects {
    let o = objects.get(id);
    if (!o) {
      const make = (m: LineMaterial) => {
        const l = new LineSegments2(new LineSegmentsGeometry(), m);
        l.frustumCulled = false;
        l.visible = false;
        scene.add(l);
        return l;
      };
      o = {
        solid: make(solidMat),
        dashed: make(dashedMat),
        lead: make(solidMat),
        prediction: null,
        pointCount: 0,
        firstIndex: -1,
        builtAt: -Infinity,
        origin: { x: 0, y: 0, z: 0 },
      };
      objects.set(id, o);
    }
    return o;
  }

  return {
    update(
      predictions: Map<string, Prediction>,
      shipPosition: (id: string) => Vec3 | null,
      simTick: number,
      dt: number,
      focus: Vec3,
      cameraDistance: number,
      realDt: number,
    ) {
      clock += realDt;
      solidMat.linewidth = T.burnWidthPx;
      dashedMat.linewidth = T.coastWidthPx;
      solidMat.opacity = T.burnOpacity;
      dashedMat.opacity = T.coastOpacity;
      dashedMat.dashSize = cameraDistance * T.dashScale;
      dashedMat.gapSize = cameraDistance * T.dashScale * 0.7;

      for (const [id, o] of objects) {
        if (!predictions.has(id)) {
          for (const l of [o.solid, o.dashed, o.lead]) {
            scene.remove(l);
            l.geometry.dispose();
          }
          objects.delete(id);
        }
      }

      for (const [id, p] of predictions) {
        const o = objectsFor(id);
        const pts = p.points;
        const elapsed = (simTick - p.startTick) * dt;
        let first = 1;
        while (first < pts.length && pts[first].t <= elapsed) first++;

        const changed = o.prediction !== p || o.pointCount !== pts.length;
        const moved = first !== o.firstIndex && clock - o.builtAt >= REBUILD_INTERVAL_S;
        if (changed || moved) {
          o.prediction = p;
          o.pointCount = pts.length;
          o.firstIndex = first;
          o.builtAt = clock;
          o.origin = pts[0].position;
          const solid: number[] = [];
          const dashed: number[] = [];
          for (let i = first; i < pts.length; i++) {
            const a = pts[i - 1].position, b = pts[i].position;
            const out = pts[i - 1].burning ? solid : dashed;
            out.push(a.x - o.origin.x, a.z - o.origin.z, -(a.y - o.origin.y), b.x - o.origin.x, b.z - o.origin.z, -(b.y - o.origin.y));
          }
          replaceGeometry(o.solid, solid);
          replaceGeometry(o.dashed, dashed);
          if (dashed.length) o.dashed.computeLineDistances();
        }

        // Lead-in from the ship's current position to the next path point. One segment,
        // rebuilt every frame.
        const here = shipPosition(id);
        const next = pts[Math.min(first, pts.length - 1)];
        const lead: number[] = [];
        if (here && next && pts[first - 1]?.burning) {
          lead.push(
            here.x - o.origin.x, here.z - o.origin.z, -(here.y - o.origin.y),
            next.position.x - o.origin.x, next.position.z - o.origin.z, -(next.position.y - o.origin.y),
          );
        }
        replaceGeometry(o.lead, lead);

        toRender(o.origin, focus, v);
        o.solid.position.copy(v);
        o.dashed.position.copy(v);
        o.lead.position.copy(v);
      }
    },
  };
}
