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

const ChromaticSplitShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uConstPx: { value: 0 },
    uRadialPx: { value: 0 },
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
    uniform float uConstPx, uRadialPx;
    varying vec2 vUv;
    void main() {
      vec2 fromCenter = (vUv - 0.5) * 2.0; // -1..1
      vec2 offPx = vec2(uConstPx, 0.0) + fromCenter * uRadialPx;
      vec2 off = offPx / uResolution;
      vec4 base = texture2D(tDiffuse, vUv);
      float r = texture2D(tDiffuse, vUv + off).r;
      float b = texture2D(tDiffuse, vUv - off).b;
      gl_FragColor = vec4(r, base.g, b, base.a);
    }
  `,
};

export interface Effects {
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
    render() {
      bloom.enabled = T.enabled && T.bloomStrength > 0;
      bloom.strength = T.bloomStrength;
      bloom.radius = T.bloomRadius;
      bloom.threshold = T.bloomThreshold;
      split.enabled = T.enabled && (T.chromaticPx > 0 || T.chromaticRadialPx > 0);
      split.uniforms.uConstPx.value = T.chromaticPx * renderer.getPixelRatio();
      split.uniforms.uRadialPx.value = T.chromaticRadialPx * renderer.getPixelRatio();
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
      points.visible = T.dustOpacity > 0;
    },
  };
}
