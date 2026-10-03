// The holotable: reference-plane grid, range rings, bounding box, axes and labels.
// The plane passes through the camera focus (three.js origin). Grid lines are anchored to
// world coordinates; range rings are centered on the focus.

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { holotableTuning as T } from "../data/holotable";
import type { Vec3 } from "../sim/vec3";
import { formatDistance } from "../ui/format";
import { palette } from "./palette";
import { gridLevels, gridStrength, niceStep } from "./scale";

const MAX_RING_LABELS = 12;

const planeVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uHalf;
  varying vec2 vPos;
  void main() {
    vPos = position.xy * uHalf;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const planeFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uHalf, uBase, uT, uGridOpacity, uRingOpacity, uEdgeFade, uRingA, uRingB, uRingMix;
  uniform vec2 uOffset;
  uniform vec3 uGridColor, uRingColor;
  varying vec2 vPos;

  // 1 on a grid line, 0 elsewhere, anti-aliased to about one pixel.
  float lines(vec2 p, float spacing) {
    vec2 q = p / spacing;
    vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  float circles(float r, float spacing) {
    float q = r / spacing;
    return 1.0 - min(abs(fract(q - 0.5) - 0.5) / fwidth(q), 1.0);
  }
  float strength(float i) { return clamp(0.5 + 0.5 * (i - uT), 0.0, 1.0); }

  void main() {
    #include <logdepthbuf_fragment>
    vec2 w = vPos + uOffset;
    float g = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      g = max(g, lines(w, uBase * pow(10.0, fi)) * strength(fi));
    }
    float edge = max(abs(vPos.x), abs(vPos.y)) / uHalf;
    g *= 1.0 - smoothstep(1.0 - uEdgeFade, 1.0, edge);

    // Tick marks along the box edge at every visible grid line.
    float band = smoothstep(0.965, 0.975, edge) * step(edge, 1.0);
    float ticks = max(lines(w, uBase) * (1.0 - uT), lines(w, uBase * 10.0));
    g = max(g, ticks * band * 1.4);
    // Plane border, so the ticks sit on a ruler line.
    float border = 1.0 - min(abs(edge - 0.999) / fwidth(edge), 1.0);
    g = max(g, border * 0.8);

    float r = length(vPos);
    // Two ring spacings crossfade when the spacing steps (A = current, B = previous).
    float ring = max(circles(r, uRingA) * uRingMix, circles(r, uRingB) * (1.0 - uRingMix));
    ring *= 1.0 - smoothstep(0.85, 0.98, r / uHalf);

    float ga = g * uGridOpacity;
    float ra = ring * uRingOpacity;
    float a = max(ga, ra);
    if (a < 0.003) discard;
    vec3 col = (uGridColor * ga + uRingColor * ra) / max(ga + ra, 1e-5);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

function label(text: string, className: string): CSS2DObject {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

export interface Holotable {
  update(focus: Vec3, cameraDistance: number, dt: number, camera: THREE.Camera): void;
}

export function createHolotable(scene: THREE.Scene, readout: HTMLElement): Holotable {
  const group = new THREE.Group();
  scene.add(group);

  // --- plane grid + range rings ---
  const uniforms = {
    uHalf: { value: 1 },
    uBase: { value: 1 },
    uT: { value: 0 },
    uOffset: { value: new THREE.Vector2() },
    uRingA: { value: 1 },
    uRingB: { value: 1 },
    uRingMix: { value: 1 },
    uGridOpacity: { value: T.gridOpacity },
    uRingOpacity: { value: T.ringOpacity },
    uEdgeFade: { value: T.edgeFade },
    uGridColor: { value: new THREE.Color(palette.grid).multiplyScalar(2.2) },
    uRingColor: { value: new THREE.Color(palette.chrome) },
  };
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: planeVertex,
      fragmentShader: planeFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      extensions: { derivatives: true } as never,
    }),
  );
  plane.rotation.x = -Math.PI / 2; // local XY -> three XZ, i.e. sim XY
  plane.frustumCulled = false;
  plane.renderOrder = -10;
  group.add(plane);

  // --- bounding box edges (unit cube, scaled each frame) ---
  const boxMat = new THREE.LineBasicMaterial({ color: palette.grid, transparent: true, opacity: T.boxOpacity, depthWrite: false });
  const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), boxMat);
  box.frustumCulled = false;
  group.add(box);

  // --- axes through the focus: X and Y on the plane, Z vertical ---
  const axisMat = new THREE.LineBasicMaterial({ color: palette.chrome, transparent: true, opacity: T.axisOpacity, depthWrite: false });
  const axesGeo = new THREE.BufferGeometry();
  // three.js axes: sim X = +x, sim Y = -z, sim Z = +y. Unit lengths, scaled each frame.
  axesGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, -1, 0, 0, 1, 0], 3),
  );
  const axes = new THREE.LineSegments(axesGeo, axisMat);
  axes.frustumCulled = false;
  group.add(axes);

  const xLabel = label("X", "table-label axis-label");
  const yLabel = label("Y", "table-label axis-label");
  const zLabel = label("Z", "table-label axis-label");
  group.add(xLabel, yLabel, zLabel);

  // Range ring labels, on the near side of the rings (toward the camera), turned 30° right.
  const ringLabels: CSS2DObject[] = [];
  for (let i = 0; i < MAX_RING_LABELS; i++) {
    const l = label("", "table-label ring-label");
    ringLabels.push(l);
    group.add(l);
  }
  const ringBearing = new THREE.Vector3();
  let ringStep = 0;
  let prevRingStep = 0;
  let ringMix = 1;

  return {
    update(focus, distance, dt, camera) {
      const half = distance * T.boxScale;
      const height = half * T.boxHeightRatio;
      const { base, t } = gridLevels(distance, T.gridDensity);

      // World-anchored grid: shift by the focus, reduced modulo the coarsest spacing so
      // the value sent to the GPU stays small (floating origin).
      const coarse = base * 100;
      uniforms.uHalf.value = half;
      uniforms.uBase.value = base;
      uniforms.uT.value = t;
      uniforms.uOffset.value.set(((focus.x % coarse) + coarse) % coarse, ((focus.y % coarse) + coarse) % coarse);
      uniforms.uGridOpacity.value = T.gridOpacity;
      uniforms.uRingOpacity.value = T.ringOpacity;
      uniforms.uEdgeFade.value = T.edgeFade;
      boxMat.opacity = T.boxOpacity;
      axisMat.opacity = T.axisOpacity;

      plane.scale.set(half, half, 1);
      box.scale.set(half, height, half);
      axes.scale.set(half, height, half);

      xLabel.position.set(half * 1.04, 0, 0);
      yLabel.position.set(0, 0, -half * 1.04);
      zLabel.position.set(0, height * 1.08, 0);

      // Range rings: 1-2-5 spacing, crossfading when it steps.
      const target = niceStep(half / T.ringCount);
      if (ringStep === 0) ringStep = prevRingStep = target;
      if (target !== ringStep) {
        prevRingStep = ringStep;
        ringStep = target;
        ringMix = 0;
      }
      ringMix = Math.min(1, ringMix + dt / Math.max(0.01, T.ringFadeTime));
      uniforms.uRingA.value = ringStep;
      uniforms.uRingB.value = prevRingStep;
      uniforms.uRingMix.value = ringMix;

      ringBearing.set(camera.position.x, 0, camera.position.z);
      if (ringBearing.lengthSq() < 1e-6) ringBearing.set(0, 0, 1);
      ringBearing.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (30 * Math.PI) / 180);

      let n = 0;
      for (let k = 1; n < MAX_RING_LABELS; k++) {
        const r = k * ringStep;
        if (r > half * 0.85) break;
        const l = ringLabels[n++];
        l.visible = true;
        l.element.style.opacity = String(ringMix);
        l.element.textContent = formatDistance(r);
        l.position.copy(ringBearing).multiplyScalar(r);
      }
      for (; n < MAX_RING_LABELS; n++) ringLabels[n].visible = false;

      const shown = gridStrength(0, t) >= 0.25 ? base : base * 10;
      readout.textContent = `GRID ${formatDistance(shown)}   ·   RINGS ${formatDistance(ringStep)}`;
    },
  };
}
