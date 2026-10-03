// The holotable: reference-plane grid, range rings, bounding box, axes and labels, plus
// back-wall grids (height ruler) and range spheres for reading the third dimension.
// The plane passes through the camera focus (three.js origin). Grid lines are anchored to
// world coordinates; range rings, spheres and height lines are centered on the focus.

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { holotableTuning as T } from "../data/holotable";
import type { Vec3 } from "../sim/vec3";
import { formatDistance } from "../ui/format";
import { palette } from "./palette";
import { gridLevels, gridStrength, niceStep } from "./scale";

const MAX_RING_LABELS = 12;
const MAX_SPHERE_RINGS = 12;
const MAX_HEIGHT_LABELS = 8; // per side (above and below)

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

// Back walls: vertical lines continue the floor grid (world-anchored along the wall);
// horizontal lines are height steps from the reference plane at the ring spacing.
const wallVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform vec2 uHalfUV;
  varying vec2 vPos;
  void main() {
    vPos = position.xy * uHalfUV;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const wallFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec2 uHalfUV;
  uniform float uBase, uT, uOpacity, uOffsetU, uRingA, uRingB, uRingMix;
  uniform vec3 uColor;
  varying vec2 vPos;

  float line1(float p, float spacing) {
    float q = p / spacing;
    return 1.0 - min(abs(fract(q - 0.5) - 0.5) / fwidth(q), 1.0);
  }
  float strength(float i) { return clamp(0.5 + 0.5 * (i - uT), 0.0, 1.0); }

  void main() {
    #include <logdepthbuf_fragment>
    float u = vPos.x + uOffsetU;
    float g = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      g = max(g, line1(u, uBase * pow(10.0, fi)) * strength(fi) * 0.7);
    }
    float h = max(line1(vPos.y, uRingA) * uRingMix, line1(vPos.y, uRingB) * (1.0 - uRingMix));
    g = max(g, h);
    // Fade toward the wall's side edges so it reads as a backdrop, not a frame.
    float side = abs(vPos.x) / uHalfUV.x;
    g *= 1.0 - smoothstep(0.75, 1.0, side) * 0.7;
    float a = g * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

// Range sphere rings: plain lines that fade out before poking through the box top or bottom.
const sphereVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying float vHeight;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vHeight = world.y;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

const sphereFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uOpacity, uBoxHeight;
  uniform vec3 uColor;
  varying float vHeight;
  void main() {
    #include <logdepthbuf_fragment>
    float a = uOpacity * (1.0 - smoothstep(0.8, 1.0, abs(vHeight) / uBoxHeight));
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

function unitCircle(segments: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(Math.cos(a), Math.sin(a), 0);
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
}

const signedDistance = (m: number) => (m > 0 ? "+" : m < 0 ? "\u2212" : "") + formatDistance(Math.abs(m));

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
  // --- back walls ---
  const wallColor = new THREE.Color(palette.grid).multiplyScalar(2.2);
  const makeWall = () => {
    const u = {
      uHalfUV: { value: new THREE.Vector2(1, 1) },
      uBase: { value: 1 },
      uT: { value: 0 },
      uOpacity: { value: T.wallOpacity },
      uOffsetU: { value: 0 },
      uRingA: { value: 1 },
      uRingB: { value: 1 },
      uRingMix: { value: 1 },
      uColor: { value: wallColor },
    };
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: wallVertex,
        fragmentShader: wallFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = -11;
    group.add(mesh);
    return { mesh, u };
  };
  // wallX stands perpendicular to sim X; its horizontal axis runs along sim Y.
  // Rotating a local-XY plane by +90° about three's Y maps local x to three -z, i.e. sim +Y.
  const wallX = makeWall();
  wallX.mesh.rotation.y = Math.PI / 2;
  // wallY stands perpendicular to sim Y; its horizontal axis runs along sim X.
  const wallY = makeWall();

  const heightLabels: CSS2DObject[] = [];
  for (let i = 0; i < MAX_HEIGHT_LABELS * 2; i++) {
    const l = label("", "table-label height-label");
    heightLabels.push(l);
    group.add(l);
  }

  // --- range spheres: rings in the sim X-Z and Y-Z planes, current (A) and previous (B) spacing ---
  const circleGeo = unitCircle(128);
  const makeSphereMat = () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0 },
        uBoxHeight: { value: 1 },
        uColor: { value: new THREE.Color(palette.chrome) },
      },
      vertexShader: sphereVertex,
      fragmentShader: sphereFragment,
      transparent: true,
      depthWrite: false,
    });
  const sphereSets = [makeSphereMat(), makeSphereMat()].map((mat) => {
    const loops: THREE.LineLoop[] = [];
    for (let i = 0; i < MAX_SPHERE_RINGS; i++) {
      const xz = new THREE.LineLoop(circleGeo, mat); // three XY plane = sim X-Z
      const yz = new THREE.LineLoop(circleGeo, mat); // three ZY plane = sim Y-Z
      yz.rotation.y = Math.PI / 2;
      for (const l of [xz, yz]) {
        l.frustumCulled = false;
        group.add(l);
        loops.push(l);
      }
    }
    return { mat, loops };
  });

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

      // Back walls: the two walls on the far side from the camera.
      const farX = camera.position.x > 0 ? -half : half; // three x = sim X
      const farZ = camera.position.z > 0 ? -half : half; // three z = -sim Y
      wallX.mesh.visible = wallY.mesh.visible = T.showBackWalls && T.wallOpacity > 0;
      wallX.mesh.position.set(farX, 0, 0);
      wallY.mesh.position.set(0, 0, farZ);
      for (const [w, offsetAxis] of [[wallX, focus.y], [wallY, focus.x]] as const) {
        w.mesh.scale.set(half, height, 1);
        w.u.uHalfUV.value.set(half, height);
        w.u.uBase.value = base;
        w.u.uT.value = t;
        w.u.uOpacity.value = T.wallOpacity;
        w.u.uRingA.value = ringStep;
        w.u.uRingB.value = prevRingStep;
        w.u.uRingMix.value = ringMix;
        w.u.uOffsetU.value = ((offsetAxis % coarse) + coarse) % coarse;
      }
      // wallX's local u runs along sim +Y; wallY's along sim +X. Both are world-anchored by
      // the offset above.

      // Height labels up the back corner where the two walls meet.
      let hn = 0;
      if (wallX.mesh.visible) {
        for (let k = 1; k <= MAX_HEIGHT_LABELS; k++) {
          const hgt = k * ringStep;
          if (hgt > height * 0.95) break;
          for (const sign of [1, -1]) {
            const l = heightLabels[hn++];
            l.visible = true;
            l.element.style.opacity = String(ringMix);
            l.element.textContent = signedDistance(sign * hgt);
            l.position.set(farX, sign * hgt, farZ);
          }
        }
      }
      for (; hn < heightLabels.length; hn++) heightLabels[hn].visible = false;

      // Range spheres.
      const spheresOn = T.showRangeSpheres && T.sphereOpacity > 0;
      const setSpheres = (set: (typeof sphereSets)[number], step: number, opacity: number) => {
        set.mat.uniforms.uOpacity.value = opacity;
        set.mat.uniforms.uBoxHeight.value = height;
        for (let i = 0; i < MAX_SPHERE_RINGS; i++) {
          const r = (i + 1) * step;
          const show = spheresOn && opacity > 0.003 && r <= half * 0.85;
          for (const l of [set.loops[i * 2], set.loops[i * 2 + 1]]) {
            l.visible = show;
            l.scale.setScalar(r);
          }
        }
      };
      setSpheres(sphereSets[0], ringStep, T.sphereOpacity * ringMix);
      setSpheres(sphereSets[1], prevRingStep, T.sphereOpacity * (1 - ringMix));

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
