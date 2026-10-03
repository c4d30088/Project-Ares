// Torpedo intercept lines: a thin line from each torpedo in flight to its predicted impact
// point (DESIGN.md section 7). Red for hostile torpedoes, blue for our own. Rebuilt every
// frame relative to the camera focus (floating origin): there are few of them.

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
    const mat = new LineMaterial({ color, linewidth: T.interceptWidthPx, transparent: true, depthWrite: false });
    const line = new LineSegments2(new LineSegmentsGeometry(), mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    return line;
  };
  const own = make(palette.friendly);
  const hostile = make(palette.threat);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  function rebuild(line: LineSegments2, segs: InterceptLine[], focus: Vec3) {
    const pos: number[] = [];
    for (const s of segs) {
      toRender(s.from, focus, a);
      toRender(s.to, focus, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    line.geometry.dispose();
    const g = new LineSegmentsGeometry();
    if (pos.length) g.setPositions(pos);
    line.geometry = g;
    line.visible = pos.length > 0;
    const mat = line.material as LineMaterial;
    mat.linewidth = T.interceptWidthPx;
    mat.opacity = T.interceptOpacity;
  }

  return {
    update(lines: InterceptLine[], focus: Vec3) {
      rebuild(own, lines.filter((l) => !l.hostile), focus);
      rebuild(hostile, lines.filter((l) => l.hostile), focus);
    },
  };
}
