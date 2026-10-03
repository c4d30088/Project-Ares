// Celestial bodies at true size: a solid dark surface (so the far side is hidden and the
// body reads as solid), topographic contour lines over gentle relief, and a rim glow.
// Asteroids get strong relief and a stretched shape; moons stay nearly round.
// The relief is visual only and seeded from the body id, so each body keeps its shape.

import * as THREE from "three";
import { bodyTuning as T } from "../data/bodies";
import type { Vec3 } from "../sim/vec3";
import type { BodySymbol } from "./displayList";
import { toRender } from "./frame";
import { palette } from "./palette";

// 3D simplex noise: Ashima Arts / Stefan Gustavson (MIT licence), webgl-noise.
const NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  float fbm(vec3 p) {
    float sum = 0.0, amp = 0.55;
    for (int i = 0; i < 3; i++) { sum += amp * snoise(p); p *= 2.03; amp *= 0.5; }
    return sum;
  }
`;

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uRough, uFreq;
  uniform vec3 uSeed;
  varying vec3 vDir;
  varying vec3 vViewPos;
  varying vec3 vNormal;
  ${NOISE}
  vec3 displaced(vec3 n) { return n * (1.0 + uRough * fbm(n * uFreq + uSeed)); }
  void main() {
    vec3 n = normalize(position);
    vDir = n;
    vec3 p0 = displaced(n);
    // Smooth surface normal from two nearby displaced points (central to the relief).
    vec3 t1 = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(n, t1);
    vec3 p1 = displaced(normalize(n + t1 * 0.01));
    vec3 p2 = displaced(normalize(n + t2 * 0.01));
    vNormal = normalize(normalMatrix * cross(p1 - p0, p2 - p0));
    vec4 mv = modelViewMatrix * vec4(p0, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uContours, uContourOpacity, uRimOpacity, uFreq;
  uniform vec3 uLine, uFill, uSeed;
  varying vec3 vDir;
  varying vec3 vViewPos;
  varying vec3 vNormal;
  ${NOISE}
  float contour(float q) { return 1.0 - min(abs(fract(q - 0.5) - 0.5) / max(fwidth(q), 1e-6), 1.0); }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 nrm = normalize(vNormal);
    float facing = abs(dot(nrm, normalize(-vViewPos)));
    float rim = pow(1.0 - facing, 3.0);
    // Height evaluated per pixel so contour lines stay smooth (not per-triangle).
    float h = fbm(normalize(vDir) * uFreq + uSeed);
    float q = h * uContours * 0.5;
    float lines = max(contour(q) * 0.5, contour(q / 5.0));
    vec3 col = uFill + uLine * (lines * uContourOpacity + rim * uRimOpacity);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Small deterministic hash of a string to [0, 1) values. Rendering only. */
function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

interface BodyMesh {
  mesh: THREE.Mesh;
  stretch: THREE.Vector3;
  uniforms: Record<string, THREE.IUniform>;
  kind: BodySymbol["kind"];
}

export function createBodyLayer(scene: THREE.Scene) {
  const geometry = new THREE.IcosahedronGeometry(1, 5);
  const items = new Map<string, BodyMesh>();
  const v = new THREE.Vector3();
  const line = new THREE.Color(palette.chrome);
  const fill = new THREE.Color(palette.bg).lerp(new THREE.Color(palette.chrome), 0.05);

  function create(b: BodySymbol): BodyMesh {
    const isAsteroid = b.kind === "asteroid";
    const uniforms = {
      uRough: { value: 0 },
      uFreq: { value: T.noiseFrequency },
      uSeed: { value: new THREE.Vector3(hash01(b.id, 1) * 100, hash01(b.id, 2) * 100, hash01(b.id, 3) * 100) },
      uContours: { value: T.contourCount },
      uContourOpacity: { value: T.contourOpacity },
      uRimOpacity: { value: T.rimOpacity },
      uLine: { value: line },
      uFill: { value: fill },
    };
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }));
    mesh.frustumCulled = false;
    // Asteroids: a random stretch and orientation, fixed per body.
    const stretch = isAsteroid
      ? new THREE.Vector3(1, 1 - T.asteroidStretch * hash01(b.id, 4), 1 - T.asteroidStretch * hash01(b.id, 5))
      : new THREE.Vector3(1, 1, 1);
    if (isAsteroid) mesh.rotation.set(hash01(b.id, 6) * Math.PI, hash01(b.id, 7) * Math.PI, hash01(b.id, 8) * Math.PI);
    scene.add(mesh);
    return { mesh, stretch, uniforms, kind: b.kind };
  }

  return {
    update(bodies: BodySymbol[], focus: Vec3) {
      for (const b of bodies) {
        let it = items.get(b.id);
        if (!it) {
          it = create(b);
          items.set(b.id, it);
        }
        const u = it.uniforms;
        u.uRough.value = it.kind === "asteroid" ? T.asteroidRoughness : T.moonRoughness;
        u.uFreq.value = T.noiseFrequency;
        u.uContours.value = T.contourCount;
        u.uContourOpacity.value = T.contourOpacity;
        u.uRimOpacity.value = T.rimOpacity;
        toRender(b.position, focus, v);
        it.mesh.position.copy(v);
        it.mesh.scale.copy(it.stretch).multiplyScalar(b.radius);
      }
    },
  };
}
