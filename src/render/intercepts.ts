// Torpedo intercept lines: a thin dotted line along the path each torpedo in flight will
// fly to its impact (DESIGN.md section 7). Yellow for the enemy's, green for our own.
// Rebuilt every frame relative to the camera focus (floating origin).

import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { pathTuning as T } from "../data/paths";
import type { Vec3 } from "../sim/vec3";
import type { InterceptLine } from "./displayList";
import { toRender } from "./frame";
import { palette } from "./palette";

export function createInterceptLayer(scene: THREE.Scene) {
  const make = (color: string) => {
    const mat = new LineMaterial({ color, linewidth: T.interceptWidthPx, transparent: true, depthWrite: false, dashed: true });
    const line = new LineSegments2(new LineSegmentsGeometry(), mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    return line;
  };
  const own = make(palette.fireFriendly);
  const hostile = make(palette.fireHostile);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  function rebuild(line: LineSegments2, paths: InterceptLine[], focus: Vec3, cameraDistance: number) {
    const pos: number[] = [];
    for (const p of paths) {
      for (let i = 1; i < p.points.length; i++) {
        toRender(p.points[i - 1], focus, a);
        toRender(p.points[i], focus, b);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    line.geometry.dispose();
    const g = new LineSegmentsGeometry();
    if (pos.length) g.setPositions(pos);
    line.geometry = g;
    line.visible = pos.length > 0;
    if (pos.length) line.computeLineDistances();
    const mat = line.material as LineMaterial;
    mat.linewidth = T.interceptWidthPx;
    mat.opacity = T.interceptOpacity;
    mat.dashSize = cameraDistance * T.interceptDotScale;
    mat.gapSize = cameraDistance * T.interceptDotScale * 1.5;
  }

  return {
    update(lines: InterceptLine[], focus: Vec3, cameraDistance: number) {
      rebuild(own, lines.filter((l) => !l.hostile), focus, cameraDistance);
      rebuild(hostile, lines.filter((l) => l.hostile), focus, cameraDistance);
    },
  };
}
