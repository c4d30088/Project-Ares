// PDC coverage and fire (DESIGN.md sections 7 and 12). Each of our ships' mounts is drawn
// as a translucent dome out to effective range, centered on the mount's direction and as
// wide as its arc; a mount that is firing brightens. Firing guns spray tracer rounds,
// short streaks flying out to where the target will be (ours in green, the enemy's in
// yellow), over a faint line from gun to target. The rounds are for show: the sim
// decides kills.

import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { pdcTuning } from "../data/weapons";
import { pathTuning as T } from "../data/paths";
import { leadShot } from "../sim/intercept";
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

/** A gun that is firing: where from, at what, and how both move (for leading). */
export interface Tracer {
  key: string;
  from: Vec3;
  fromVelocity: Vec3;
  to: Vec3;
  toVelocity: Vec3;
  hostile: boolean;
}

interface Round {
  position: Vec3;
  velocity: Vec3;
  lifeS: number;
  hostile: boolean;
}

/** Most rounds drawn at once. */
const MAX_ROUNDS = 800;

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
  const ownLines = make(tracerMat(palette.fireFriendly));
  const hostileLines = make(tracerMat(palette.fireHostile));
  const ownRounds = make(tracerMat(palette.fireFriendly));
  const hostileRounds = make(tracerMat(palette.fireHostile));
  const rounds: Round[] = [];
  const spawnDebt = new Map<string, number>();

  /**
   * New rounds from each firing gun. A round leaves with the gun's velocity plus the
   * muzzle velocity, aimed (in the gun's own frame) where the target will be when it
   * arrives, so the stream stays true however fast the ship or its target is moving.
   */
  function spawn(t: Tracer, simDt: number) {
    let debt = (spawnDebt.get(t.key) ?? Math.random()) + simDt * T.pdcRoundsDrawnPerS;
    // A target pulling away faster than a round flies cannot be caught: no stream.
    const shot = leadShot(t.from, t.fromVelocity, t.to, t.toVelocity, T.pdcRoundSpeed);
    if (!shot) {
      spawnDebt.set(t.key, 0);
      return;
    }
    const mx = (shot.velocity.x - t.fromVelocity.x) / T.pdcRoundSpeed;
    const my = (shot.velocity.y - t.fromVelocity.y) / T.pdcRoundSpeed;
    const mz = (shot.velocity.z - t.fromVelocity.z) / T.pdcRoundSpeed;
    while (debt >= 1 && rounds.length < MAX_ROUNDS) {
      debt -= 1;
      // A little scatter, so the stream reads as rounds, not a beam.
      const j = 0.004;
      const ux = mx + (Math.random() - 0.5) * j, uy = my + (Math.random() - 0.5) * j, uz = mz + (Math.random() - 0.5) * j;
      // Rounds born part way through the frame start part way along.
      const age = Math.random() * Math.min(simDt, shot.t);
      const vel = { x: ux * T.pdcRoundSpeed + t.fromVelocity.x, y: uy * T.pdcRoundSpeed + t.fromVelocity.y, z: uz * T.pdcRoundSpeed + t.fromVelocity.z };
      rounds.push({
        position: { x: t.from.x + vel.x * age, y: t.from.y + vel.y * age, z: t.from.z + vel.z * age },
        velocity: vel,
        lifeS: shot.t - age,
        hostile: t.hostile,
      });
    }
    spawnDebt.set(t.key, Math.min(debt, 1));
  }

  function streaks(line: LineSegments2, hostile: boolean, focus: Vec3) {
    const pos: number[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const r of rounds) {
      if (r.hostile !== hostile) continue;
      const tail = { x: r.position.x - r.velocity.x * T.pdcStreakS, y: r.position.y - r.velocity.y * T.pdcStreakS, z: r.position.z - r.velocity.z * T.pdcStreakS };
      toRender(tail, focus, a);
      toRender(r.position, focus, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    line.geometry.dispose();
    const g = new LineSegmentsGeometry();
    if (pos.length) g.setPositions(pos);
    line.geometry = g;
    line.visible = pos.length > 0;
    (line.material as LineMaterial).opacity = 1;
  }

  function domeMesh(arc: number): THREE.Mesh {
    // A spherical cap around +Y, radius 1, opening `arc` from the pole.
    const geo = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, arc);
    const mat = new THREE.MeshBasicMaterial({ color: palette.friendly, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }

  function rebuild(line: LineSegments2, list: { from: Vec3; to: Vec3 }[], focus: Vec3, opacity: number) {
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
    /** simDt: sim seconds that passed this frame (0 while paused). */
    update(list: PdcDome[], tracers: Tracer[], focus: Vec3, simDt: number) {
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
      // Move the rounds in flight, retire those that arrived, then fire new ones.
      for (const r of rounds) {
        r.position.x += r.velocity.x * simDt;
        r.position.y += r.velocity.y * simDt;
        r.position.z += r.velocity.z * simDt;
        r.lifeS -= simDt;
      }
      for (let i = rounds.length - 1; i >= 0; i--) if (rounds[i].lifeS <= 0) rounds.splice(i, 1);
      for (const t of tracers) spawn(t, simDt);
      for (const key of [...spawnDebt.keys()]) if (!tracers.some((t) => t.key === key)) spawnDebt.delete(key);

      rebuild(ownLines, tracers.filter((t) => !t.hostile), focus, T.pdcLineOpacity);
      rebuild(hostileLines, tracers.filter((t) => t.hostile), focus, T.pdcLineOpacity);
      streaks(ownRounds, false, focus);
      streaks(hostileRounds, true, focus);
    },
  };
}
