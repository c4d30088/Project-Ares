// PDC coverage and fire (DESIGN.md sections 7 and 12). Each of our ships' mounts is drawn
// as a translucent dome out to effective range, centered on the mount's direction and as
// wide as its arc; a mount that is firing brightens. Tracers run from each firing gun to
// what it is shooting at, ours in blue and the enemy's in red.

import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { pdcTuning } from "../data/weapons";
import { pathTuning as T } from "../data/paths";
import type { Vec3 } from "../sim/vec3";
import { toRender } from "./frame";
import { palette } from "./palette";

export interface PdcDome {
  key: string;
  center: Vec3;
  /** Mount direction (sim axes), arc half-angle (radians), firing. */
  direction: Vec3;
  arc: number;
  firing: boolean;
}

export interface Tracer {
  from: Vec3;
  to: Vec3;
  hostile: boolean;
}

export function createPdcLayer(scene: THREE.Scene) {
  const domes = new Map<string, { mesh: THREE.Mesh; arc: number }>();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const tracerMat = (color: string) => new LineMaterial({ color, linewidth: 1.5, transparent: true, depthWrite: false });
  const make = (mat: LineMaterial) => {
    const l = new LineSegments2(new LineSegmentsGeometry(), mat);
    l.frustumCulled = false;
    l.visible = false;
    scene.add(l);
    return l;
  };
  const ownTracers = make(tracerMat(palette.friendly));
  const hostileTracers = make(tracerMat(palette.threat));
  let clock = 0;

  function domeMesh(arc: number): THREE.Mesh {
    // A spherical cap around +Y, radius 1, opening `arc` from the pole.
    const geo = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, arc);
    const mat = new THREE.MeshBasicMaterial({ color: palette.friendly, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }

  function rebuild(line: LineSegments2, list: Tracer[], focus: Vec3, opacity: number) {
    const pos: number[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const t of list) {
      toRender(t.from, focus, a);
      toRender(t.to, focus, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    line.geometry.dispose();
    const g = new LineSegmentsGeometry();
    if (pos.length) g.setPositions(pos);
    line.geometry = g;
    line.visible = pos.length > 0;
    (line.material as LineMaterial).opacity = opacity;
  }

  return {
    update(list: PdcDome[], tracers: Tracer[], focus: Vec3, realDt: number) {
      clock += realDt;
      const seen = new Set<string>();
      for (const d of list) {
        let e = domes.get(d.key);
        if (!e || e.arc !== d.arc) {
          if (e) {
            scene.remove(e.mesh);
            e.mesh.geometry.dispose();
          }
          e = { mesh: domeMesh(d.arc), arc: d.arc };
          domes.set(d.key, e);
        }
        seen.add(d.key);
        toRender(d.center, focus, v);
        e.mesh.position.copy(v);
        e.mesh.scale.setScalar(pdcTuning.effectiveRange);
        dir.set(d.direction.x, d.direction.z, -d.direction.y).normalize();
        e.mesh.quaternion.setFromUnitVectors(up, dir);
        (e.mesh.material as THREE.MeshBasicMaterial).opacity = d.firing ? T.pdcDomeFiringOpacity : T.pdcDomeOpacity;
      }
      for (const [k, e] of domes) {
        if (!seen.has(k)) {
          scene.remove(e.mesh);
          e.mesh.geometry.dispose();
          domes.delete(k);
        }
      }
      // Tracers flicker: streams of rounds, not beams.
      const flicker = 0.55 + 0.45 * Math.abs(Math.sin(clock * 37));
      rebuild(ownTracers, tracers.filter((t) => !t.hostile), focus, flicker);
      rebuild(hostileTracers, tracers.filter((t) => t.hostile), focus, flicker);
    },
  };
}
