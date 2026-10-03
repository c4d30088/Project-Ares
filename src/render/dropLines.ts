// Drop lines: a thin vertical line from every object to the reference plane, with a small
// ring where it meets the plane. Solid above the plane, dashed below (DESIGN.md section 12).

import * as THREE from "three";
import { holotableTuning as T } from "../data/holotable";
import type { Vec3 } from "../sim/vec3";
import type { DisplayList } from "./displayList";
import { toRender } from "./frame";
import { allegianceColor } from "./icons";
import { palette } from "./palette";

const MAX_OBJECTS = 512;
const RING_SEGMENTS = 20;

function dynamicLines(maxVerts: number, material: THREE.LineBasicMaterial | THREE.LineDashedMaterial) {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.BufferAttribute(new Float32Array(maxVerts * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", pos);
  geo.setAttribute("color", col);
  const lines = new THREE.LineSegments(geo, material);
  lines.frustumCulled = false;
  let n = 0;
  return {
    lines,
    reset() {
      n = 0;
    },
    add(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, alpha: number) {
      if (n + 2 > maxVerts) return;
      pos.setXYZ(n, a.x, a.y, a.z);
      pos.setXYZ(n + 1, b.x, b.y, b.z);
      col.setXYZW(n, c.r, c.g, c.b, alpha);
      col.setXYZW(n + 1, c.r, c.g, c.b, alpha);
      n += 2;
    },
    commit() {
      geo.setDrawRange(0, n);
      pos.needsUpdate = col.needsUpdate = true;
    },
  };
}

export function createDropLines(scene: THREE.Scene) {
  const common = { vertexColors: true, transparent: true, depthWrite: false };
  const solid = dynamicLines(MAX_OBJECTS * 2, new THREE.LineBasicMaterial(common));
  const dashedMat = new THREE.LineDashedMaterial({ ...common, dashSize: 1, gapSize: 1 });
  const dashed = dynamicLines(MAX_OBJECTS * 2, dashedMat);
  const rings = dynamicLines(MAX_OBJECTS * RING_SEGMENTS * 2, new THREE.LineBasicMaterial(common));
  scene.add(solid.lines, dashed.lines, rings.lines);

  const top = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const color = new THREE.Color();

  function addObject(p: Vec3, focus: Vec3, cam: THREE.PerspectiveCamera, hex: string, alpha: number, pxPerRad: number) {
    toRender(p, focus, top);
    foot.set(top.x, 0, top.z);
    color.set(hex);
    const height = top.y;
    // Skip the line for objects essentially on the plane, but keep the foot ring.
    const distToCam = foot.distanceTo(cam.position);
    const ringR = (T.footRingPx * distToCam) / pxPerRad;
    if (Math.abs(height) > ringR * 0.5) (height >= 0 ? solid : dashed).add(top, foot, color, alpha);
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const t0 = (i / RING_SEGMENTS) * Math.PI * 2;
      const t1 = ((i + 1) / RING_SEGMENTS) * Math.PI * 2;
      a.set(foot.x + Math.cos(t0) * ringR, 0, foot.z + Math.sin(t0) * ringR);
      b.set(foot.x + Math.cos(t1) * ringR, 0, foot.z + Math.sin(t1) * ringR);
      rings.add(a, b, color, alpha * 0.9);
    }
  }

  return {
    update(list: DisplayList, focus: Vec3, cam: THREE.PerspectiveCamera, viewportHeight: number) {
      solid.reset();
      dashed.reset();
      rings.reset();
      const pxPerRad = viewportHeight / 2 / Math.tan((cam.fov * Math.PI) / 360);
      for (const s of list.symbols) {
        const isTorpedo = s.shape === "torpedo";
        const hex = isTorpedo && s.allegiance === "hostile" ? palette.threat : allegianceColor[s.allegiance];
        addObject(s.position, focus, cam, hex, isTorpedo ? T.torpedoDropLineOpacity : T.dropLineOpacity, pxPerRad);
      }
      for (const w of list.waypoints) addObject(w.position, focus, cam, palette.friendly, 0.95, pxPerRad);
      for (const body of list.bodies) {
        addObject(body.position, focus, cam, palette.chrome, T.bodyDropLineOpacity, pxPerRad);
      }
      solid.commit();
      dashed.commit();
      rings.commit();
      dashed.lines.computeLineDistances();
      const dash = cam.position.length() * T.dashScale;
      dashedMat.dashSize = dash;
      dashedMat.gapSize = dash * 0.8;
    },
  };
}
