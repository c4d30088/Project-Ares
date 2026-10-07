// Post-processing: bloom (glow on lines and icons) and a slight chromatic split, as seen
// on the holographic display references. Also a faint dust field for depth.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { effectsTuning as T } from "../data/effects";
import { Rng } from "../sim/rng";
import { palette } from "./palette";
import { settings } from "../game/settings";

const ChromaticSplitShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uConstPx: { value: 0 },
    uRadialPx: { value: 0 },
    /** Hit flicker, 0..1, and a value that changes every flicker step (picks the torn bands). */
    uGlitch: { value: 0 },
    uSeed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uConstPx, uRadialPx, uGlitch, uSeed;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // Hit flicker: a few horizontal bands tear sideways.
      float band = floor(vUv.y * 40.0);
      float n = hash(band * 12.9898 + uSeed * 78.233);
      if (n > 1.0 - 0.3 * uGlitch) uv.x += (hash(band + uSeed) - 0.5) * 0.06 * uGlitch;
      vec2 fromCenter = (uv - 0.5) * 2.0; // -1..1
      vec2 offPx = vec2(uConstPx + uGlitch * 7.0, 0.0) + fromCenter * uRadialPx;
      vec2 off = offPx / uResolution;
      vec4 base = texture2D(tDiffuse, uv);
      float r = texture2D(tDiffuse, uv + off).r;
      float b = texture2D(tDiffuse, uv - off).b;
      vec3 col = vec3(r, base.g, b);
      // ...scanlines show, and the brightness dips.
      col *= 1.0 - uGlitch * 0.3 * (0.5 + 0.5 * sin(vUv.y * uResolution.y * 1.6));
      col *= 1.0 - uGlitch * 0.35 * hash(uSeed * 3.7);
      gl_FragColor = vec4(col, base.a);
    }
  `,
};

export interface Effects {
  /** Hit flicker for the next frames, 0..1, and a seed that changes every flicker step. */
  setGlitch(amount: number, seed: number): void;
  render(): void;
  resize(w: number, h: number): void;
}

export function createEffects(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  overlays: [THREE.Scene, THREE.Camera][],
): Effects {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  for (const [s, c] of overlays) {
    const pass = new RenderPass(s, c);
    pass.clear = false;
    composer.addPass(pass);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), T.bloomStrength, T.bloomRadius, T.bloomThreshold);
  composer.addPass(bloom);
  const split = new ShaderPass(ChromaticSplitShader);
  composer.addPass(split);
  composer.addPass(new OutputPass());

  return {
    setGlitch(amount, seed) {
      split.uniforms.uGlitch.value = settings.reduceEffects ? 0 : amount;
      split.uniforms.uSeed.value = seed;
    },
    render() {
      // Reduce effects (player setting): half the glow, no color split, no hit flicker.
      const reduce = settings.reduceEffects;
      bloom.enabled = T.enabled && T.bloomStrength > 0;
      bloom.strength = T.bloomStrength * (reduce ? 0.5 : 1);
      bloom.radius = T.bloomRadius;
      bloom.threshold = T.bloomThreshold;
      split.enabled = T.enabled && (reduce ? split.uniforms.uGlitch.value > 0 : T.chromaticPx > 0 || T.chromaticRadialPx > 0 || split.uniforms.uGlitch.value > 0);
      split.uniforms.uConstPx.value = reduce ? 0 : T.chromaticPx * renderer.getPixelRatio();
      split.uniforms.uRadialPx.value = reduce ? 0 : T.chromaticRadialPx * renderer.getPixelRatio();
      composer.render();
    },
    resize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      const pr = renderer.getPixelRatio();
      split.uniforms.uResolution.value.set(w * pr, h * pr);
    },
  };
}

/** Faint dust around the focus. Scales with zoom; gives parallax depth when rotating. */
export function createDust(scene: THREE.Scene, count = 700) {
  const rng = new Rng(9001);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform in a spherical shell, radius 0.3..2.5 (in units of camera distance).
    const u = rng.range(-1, 1), th = rng.range(0, Math.PI * 2);
    const r = 0.3 + 2.2 * Math.cbrt(rng.next());
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: palette.chrome,
    size: 1.4,
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
    opacity: T.dustOpacity,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -20;
  scene.add(points);
  return {
    update(cameraDistance: number) {
      points.scale.setScalar(cameraDistance);
      mat.opacity = T.dustOpacity;
      points.visible = T.dustOpacity > 0 && !settings.reduceEffects;
    },
  };
}
