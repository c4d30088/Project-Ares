// TEMPORARY (M1 step 3): plain dots for every object in the picture, so the camera can be
// checked before the symbol set exists. Replaced by icons.ts in step 5.

import * as THREE from "three";
import type { SensorPicture } from "../sim/sensors/picture";
import type { Vec3 } from "../sim/vec3";
import { palette } from "./palette";
import { toRender } from "./frame";

export function createDebugDots(scene: THREE.Scene, picture: SensorPicture) {
  const items: { pos: Vec3; color: string }[] = [
    ...picture.ownShips.map((s) => ({ pos: s.position, color: palette.friendly })),
    ...picture.tracks.map((t) => ({
      pos: t.position,
      color: { friendly: palette.friendly, hostile: palette.hostile, neutral: palette.neutral, unknown: palette.uncertain }[t.allegiance],
    })),
    ...picture.bodies.map((b) => ({ pos: b.position, color: palette.textDim })),
  ];
  const positions = new Float32Array(items.length * 3);
  const colors = new Float32Array(items.length * 3);
  const c = new THREE.Color();
  items.forEach((it, i) => {
    c.set(it.color);
    colors.set([c.r, c.g, c.b], i * 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true }));
  points.frustumCulled = false;
  scene.add(points);

  const v = new THREE.Vector3();
  return {
    update(focus: Vec3) {
      items.forEach((it, i) => {
        toRender(it.pos, focus, v);
        positions.set([v.x, v.y, v.z], i * 3);
      });
      geo.attributes.position.needsUpdate = true;
    },
  };
}
