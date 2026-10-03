// Celestial bodies as dim holographic wireframe spheres at true size, with a crisp
// camera-facing outline ring.

import * as THREE from "three";
import { symbolTuning as T } from "../data/symbols";
import type { Vec3 } from "../sim/vec3";
import type { BodySymbol } from "./displayList";
import { toRender } from "./frame";
import { palette } from "./palette";

function sphereWireframe(meridians: number, parallels: number, segments: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let m = 0; m < meridians; m++) {
    const lon = (m / meridians) * Math.PI;
    for (let i = 0; i < segments; i++) {
      for (const k of [i, i + 1]) {
        const a = (k / segments) * Math.PI * 2;
        pts.push(Math.cos(a) * Math.cos(lon), Math.sin(a), Math.cos(a) * Math.sin(lon));
      }
    }
  }
  for (let p = 1; p < parallels; p++) {
    const lat = -Math.PI / 2 + (p / parallels) * Math.PI;
    const y = Math.sin(lat), r = Math.cos(lat);
    for (let i = 0; i < segments; i++) {
      for (const k of [i, i + 1]) {
        const a = (k / segments) * Math.PI * 2;
        pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

function circle(segments: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(Math.cos(a), Math.sin(a), 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

export function createBodyLayer(scene: THREE.Scene) {
  const wireGeo = sphereWireframe(12, 9, 72);
  const ringGeo = circle(128);
  const wireMat = new THREE.LineBasicMaterial({ color: palette.chrome, transparent: true, opacity: T.bodyOpacity, depthWrite: false });
  const ringMat = new THREE.LineBasicMaterial({ color: palette.chrome, transparent: true, opacity: 0.8, depthWrite: false });
  const items = new Map<string, { wire: THREE.LineSegments; ring: THREE.LineLoop }>();
  const v = new THREE.Vector3();

  return {
    update(bodies: BodySymbol[], focus: Vec3, cam: THREE.PerspectiveCamera) {
      wireMat.opacity = T.bodyOpacity;
      ringMat.opacity = Math.min(1, T.bodyOpacity * 2.2);
      for (const b of bodies) {
        let it = items.get(b.id);
        if (!it) {
          it = { wire: new THREE.LineSegments(wireGeo, wireMat), ring: new THREE.LineLoop(ringGeo, ringMat) };
          it.wire.frustumCulled = it.ring.frustumCulled = false;
          scene.add(it.wire, it.ring);
          items.set(b.id, it);
        }
        toRender(b.position, focus, v);
        it.wire.position.copy(v);
        it.wire.scale.setScalar(b.radius);
        it.ring.position.copy(v);
        it.ring.scale.setScalar(b.radius);
        it.ring.quaternion.copy(cam.quaternion);
      }
    },
  };
}
