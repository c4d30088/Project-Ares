// Weapon range ring: a circle on the reference plane around the active ship while a weapon
// is being aimed (torpedoes now; PDCs and the railgun later). The plane passes through the
// camera focus, so the ring is drawn at the focus height under or over the ship, like the
// drop lines. Built once as a unit circle, then scaled and moved each frame.

import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { pathTuning as T } from "../data/paths";
import type { Vec3 } from "../sim/vec3";
import { toRender } from "./frame";
import { palette } from "./palette";

export interface RangeRing {
  /** Center on the plane (sim coordinates; its z is ignored). */
  center: Vec3;
  radius: number;
}

export function createRangeRingLayer(scene: THREE.Scene) {
  const segs = 256;
  const pos: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    pos.push(Math.cos(a0), 0, Math.sin(a0), Math.cos(a1), 0, Math.sin(a1));
  }
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos);
  const mat = new LineMaterial({ color: palette.friendly, linewidth: T.rangeRingWidthPx, transparent: true, depthWrite: false });
  const line = new LineSegments2(geo, mat);
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  const v = new THREE.Vector3();

  return {
    update(ring: RangeRing | null, focus: Vec3) {
      line.visible = !!ring;
      if (!ring) return;
      toRender({ x: ring.center.x, y: ring.center.y, z: focus.z }, focus, v);
      line.position.copy(v);
      line.scale.setScalar(ring.radius);
      mat.linewidth = T.rangeRingWidthPx;
      mat.opacity = T.rangeRingOpacity;
    },
  };
}
