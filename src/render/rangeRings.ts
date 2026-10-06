// Weapon range rings: flat circles on the reference plane, one per weapon under each ship
// (see weaponRings.ts for which). The plane passes through the camera focus, so a ring is
// drawn at the focus height under or over its ship, centered on the foot of the drop line.
// One unit circle is built once and shared; each ring is a line scaled and moved per frame,
// with its own material for color, opacity and dashes, kept in a pool by key.

import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { pathTuning as T } from "../data/paths";
import type { Vec3 } from "../sim/vec3";
import { toRender } from "./frame";
import { allegianceColor } from "./icons";
import type { WeaponRing } from "./weaponRings";

export function createRangeRingLayer(scene: THREE.Scene) {
  const segs = 256;
  const pos: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    pos.push(Math.cos(a0), 0, Math.sin(a0), Math.cos(a1), 0, Math.sin(a1));
  }
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos);
  const pool = new Map<string, { line: LineSegments2; mat: LineMaterial }>();
  const v = new THREE.Vector3();

  function make(): { line: LineSegments2; mat: LineMaterial } {
    const mat = new LineMaterial({ linewidth: T.rangeRingWidthPx, transparent: true, depthWrite: false });
    const line = new LineSegments2(geo, mat);
    line.computeLineDistances();
    line.frustumCulled = false;
    scene.add(line);
    return { line, mat };
  }

  return {
    update(rings: WeaponRing[], focus: Vec3) {
      const seen = new Set<string>();
      for (const r of rings) {
        seen.add(r.key);
        let e = pool.get(r.key);
        if (!e) pool.set(r.key, (e = make()));
        toRender({ x: r.center.x, y: r.center.y, z: focus.z }, focus, v);
        e.line.position.copy(v);
        e.line.scale.setScalar(r.radius);
        e.mat.color.set(allegianceColor[r.allegiance]);
        e.mat.linewidth = T.rangeRingWidthPx;
        e.mat.opacity = r.opacity;
        // Line distances are in the unit circle's units, so a dash is a fixed share of the
        // ring whatever its radius.
        e.mat.dashed = r.dashed;
        e.mat.dashSize = T.rangeRingDash;
        e.mat.gapSize = T.rangeRingDash;
        e.line.visible = true;
      }
      for (const [key, e] of pool) {
        if (seen.has(key)) continue;
        scene.remove(e.line);
        e.mat.dispose();
        pool.delete(key);
      }
    },
  };
}
