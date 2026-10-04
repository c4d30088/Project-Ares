// Impact effects: spherical explosion blooms for torpedo hits, spark bursts for PDC and
// railgun hits, and floating hit text above struck ships. Drawn in screen pixels in an
// orthographic overlay (so the bloom pass makes them glow), anchored to points in space.
// Everything runs on the real clock: at high time compression these are quick flashes.
// The sim decides what is hit; this only shows it.

import * as THREE from "three";
import { impactTuning as T } from "../data/impacts";
import { hitTextLines, mergeHitText, type HitText, type ImpactEffect } from "./impactModel";
import type { Vec3 } from "../sim/vec3";
import { toRender } from "./frame";
import { palette } from "./palette";

const vertex = /* glsl */ `
  attribute vec2 iPos;
  attribute vec2 iSize;
  attribute float iAngle;
  attribute vec4 iColor;
  attribute vec3 iState;
  varying vec2 vP;
  varying vec4 vColor;
  varying vec3 vState;
  void main() {
    float c = cos(iAngle), s = sin(iAngle);
    vec2 p = position.xy * iSize;
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + iPos;
    vP = position.xy * 2.0;
    vColor = iColor;
    vState = iState;
    gl_Position = projectionMatrix * vec4(p, 0.0, 1.0);
  }
`;

// iState: x = age 0..1, y = kind (0 bloom, 1 spark), z = per-effect seed.
const fragment = /* glsl */ `
  uniform float uCoreHeat;
  uniform float uRingOpacity;
  varying vec2 vP;
  varying vec4 vColor;
  varying vec3 vState;
  void main() {
    float age = vState.x;
    vec3 col = vColor.rgb;
    vec3 outc = col;
    float a = 0.0;
    if (vState.y < 0.5) {
      // Explosion: a lit sphere that swells and cools, a white-hot core, and a shock ring.
      float grow = 1.0 - pow(1.0 - min(age / 0.45, 1.0), 3.0);
      float R = 0.12 + 0.6 * grow;
      float ang = atan(vP.y, vP.x);
      float wob = 1.0 + 0.07 * sin(ang * 5.0 + vState.z * 6.28) + 0.05 * sin(ang * 9.0 + vState.z * 12.5);
      float r = length(vP);
      float rr = r / (R * wob);
      if (rr < 1.0) {
        float h = sqrt(1.0 - rr * rr);
        vec3 n = vec3(vP / (R * wob), h);
        float lam = clamp(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0, 1.0);
        float rim = pow(1.0 - h, 2.0);
        float heat = clamp(uCoreHeat * pow(h, 2.5) * (1.0 - age), 0.0, 1.0);
        vec3 sphere = col * (0.35 + 0.9 * lam) + col * rim * 0.8;
        outc = mix(sphere, vec3(1.0), heat);
        a = pow(1.0 - age, 1.4) * (0.55 + 0.45 * h) * smoothstep(1.0, 0.9, rr);
      }
      float ringR = 0.15 + 0.77 * (1.0 - pow(1.0 - age, 2.0));
      float ringW = 0.03 + 0.02 * (1.0 - age);
      float ring = smoothstep(ringW, 0.0, abs(r - ringR)) * pow(1.0 - age, 2.0) * uRingOpacity;
      outc = mix(outc, col * 1.2, ring);
      a = max(a, ring);
    } else {
      // Spark: a short streak, bright at its leading end (+x), fading with age.
      float u = vP.x * 0.5 + 0.5;
      float v = abs(vP.y);
      float body = smoothstep(1.0, 0.25, v) * pow(u, 1.6);
      float head = smoothstep(0.7, 1.0, u);
      outc = mix(col, vec3(1.0), head * 0.7);
      a = body * (1.0 - age);
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(outc, a * vColor.a);
    #include <colorspace_fragment>
  }
`;

interface Bloom {
  position: Vec3;
  color: string;
  scale: number;
  seed: number;
  ageS: number;
}

interface Spark {
  position: Vec3;
  color: string;
  /** Offset from the impact point and velocity, in screen px (y down). */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  length: number;
  ageS: number;
  lifeS: number;
}

interface Popup {
  data: HitText;
  el: HTMLDivElement;
  ageS: number;
  /** Extra offset so labels that start together don't sit on top of each other, px. */
  slot: number;
}

export interface ImpactLayer {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  resize(w: number, h: number): void;
  /** Starts new effects and labels. */
  spawn(effects: ImpactEffect[], texts: HitText[]): void;
  /** Ages and draws everything. realDt is real seconds. */
  update(realDt: number, focus: Vec3, cam: THREE.PerspectiveCamera, positionOf: (id: string) => Vec3 | null): void;
  /** Removes everything on screen (scenario restart). */
  clear(): void;
}

export function createImpactLayer(textRoot: HTMLElement): ImpactLayer {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  let width = 1, height = 1;

  const MAX = 4096;
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute("position", quad.getAttribute("position"));
  const attr = (name: string, size: number) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const aPos = attr("iPos", 2);
  const aSize = attr("iSize", 2);
  const aAngle = attr("iAngle", 1);
  const aColor = attr("iColor", 4);
  const aState = attr("iState", 3);
  const material = new THREE.ShaderMaterial({
    uniforms: { uCoreHeat: { value: T.bloomCoreHeat }, uRingOpacity: { value: T.bloomRingOpacity } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const blooms: Bloom[] = [];
  const sparks: Spark[] = [];
  const popups: Popup[] = [];
  const layer = document.createElement("div");
  layer.className = "hit-text-layer";
  textRoot.appendChild(layer);

  // Plain deterministic noise for spark directions (presentation only; never touches the sim).
  let seed = 20261004;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const v = new THREE.Vector3();
  const color = new THREE.Color();
  /** Projects a sim position to screen px (origin top-left). False if behind the camera. */
  function project(p: Vec3, focus: Vec3, cam: THREE.PerspectiveCamera, out: { x: number; y: number; dist: number }): boolean {
    toRender(p, focus, v);
    out.dist = v.distanceTo(cam.position);
    v.applyMatrix4(cam.matrixWorldInverse);
    if (v.z > -cam.near) return false;
    v.applyMatrix4(cam.projectionMatrix);
    out.x = (v.x * 0.5 + 0.5) * width;
    out.y = (-v.y * 0.5 + 0.5) * height;
    return true;
  }
  const sp = { x: 0, y: 0, dist: 1 };

  function spawnSparks(e: ImpactEffect) {
    const n = Math.max(3, Math.round(T.sparkCount * e.scale));
    for (let i = 0; i < n && sparks.length < T.maxSparks; i++) {
      const a = rand() * Math.PI * 2;
      const speed = T.sparkSpeedPx * e.scale * (0.45 + 0.8 * rand());
      sparks.push({
        position: e.position,
        color: palette[e.color],
        ox: 0,
        oy: 0,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        length: T.sparkLengthPx * e.scale * (0.6 + 0.7 * rand()),
        ageS: 0,
        lifeS: T.sparkDurationS * (0.6 + 0.8 * rand()),
      });
    }
  }

  function addPopup(t: HitText) {
    for (const p of popups) {
      if (p.ageS > T.textMergeS) continue;
      const merged = mergeHitText(p.data, t);
      if (merged) {
        p.data = merged;
        p.el.textContent = hitTextLines(merged).join("\n");
        return;
      }
    }
    if (popups.length >= T.maxTexts) {
      popups[0].el.remove();
      popups.shift();
    }
    const lines = hitTextLines(t);
    if (!lines.length) return;
    const el = document.createElement("div");
    el.className = "hit-text mono";
    el.style.color = palette[t.color];
    el.textContent = lines.join("\n");
    layer.appendChild(el);
    // Labels for the same ship that start together are stacked above each other.
    const slot = popups.filter((p) => p.data.shipId === t.shipId && p.ageS < 0.6).reduce((sum, p) => sum + hitTextLines(p.data).length * 13 + 3, 0);
    popups.push({ data: t, el, ageS: 0, slot });
  }

  return {
    scene,
    camera,
    resize(w, h) {
      width = w;
      height = h;
      camera.left = -w / 2;
      camera.right = w / 2;
      camera.top = h / 2;
      camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
    },
    spawn(effects, texts) {
      if (T.enabled) {
        for (const e of effects) {
          if (e.kind === "bloom") {
            if (blooms.length >= T.maxBlooms) blooms.shift();
            blooms.push({ position: e.position, color: palette[e.color], scale: e.scale, seed: rand(), ageS: 0 });
          } else spawnSparks(e);
        }
      }
      for (const t of texts) addPopup(t);
    },
    update(dt, focus, cam, positionOf) {
      const pxPerRad = height / 2 / Math.tan((cam.fov * Math.PI) / 360);
      material.uniforms.uCoreHeat.value = T.bloomCoreHeat;
      material.uniforms.uRingOpacity.value = T.bloomRingOpacity;
      let n = 0;

      // Explosions.
      for (let i = blooms.length - 1; i >= 0; i--) {
        const b = blooms[i];
        b.ageS += dt;
        if (b.ageS >= T.bloomDurationS) {
          blooms.splice(i, 1);
          continue;
        }
        if (n >= MAX || !project(b.position, focus, cam, sp)) continue;
        // Grows toward its real size as you zoom in, within the pixel limits.
        const real = (2 * T.bloomRadiusM * pxPerRad) / Math.max(sp.dist, 1);
        const size = Math.min(T.bloomMaxPx, Math.max(T.bloomMinPx, real)) * b.scale;
        aPos.setXY(n, sp.x - width / 2, height / 2 - sp.y);
        aSize.setXY(n, size, size);
        aAngle.setX(n, 0);
        color.set(b.color);
        aColor.setXYZW(n, color.r, color.g, color.b, 1);
        aState.setXYZ(n, b.ageS / T.bloomDurationS, 0, b.seed);
        n++;
      }

      // Sparks fly outward in screen space from where they were struck, slowing as they go.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.ageS += dt;
        if (s.ageS >= s.lifeS) {
          sparks.splice(i, 1);
          continue;
        }
        s.ox += s.vx * dt;
        s.oy += s.vy * dt;
        const drag = Math.exp(-3 * dt);
        s.vx *= drag;
        s.vy *= drag;
        if (n >= MAX || !project(s.position, focus, cam, sp)) continue;
        const speed = Math.hypot(s.vx, s.vy);
        const len = Math.max(3, Math.min(s.length, s.length * (speed / (T.sparkSpeedPx * 0.6)) + 3));
        // Center the streak behind its head, which leads along the direction of travel.
        const ux = speed > 1e-3 ? s.vx / speed : 1, uy = speed > 1e-3 ? s.vy / speed : 0;
        aPos.setXY(n, sp.x + s.ox - ux * len * 0.5 - width / 2, height / 2 - (sp.y + s.oy - uy * len * 0.5));
        aSize.setXY(n, len, 2);
        // Screen y is down, ortho y is up.
        aAngle.setX(n, Math.atan2(-uy, ux));
        color.set(s.color);
        aColor.setXYZW(n, color.r, color.g, color.b, 1);
        aState.setXYZ(n, s.ageS / s.lifeS, 1, 0);
        n++;
      }

      geo.instanceCount = n;
      for (const a of [aPos, aSize, aAngle, aColor, aState]) a.needsUpdate = true;

      // Hit text: tracks the ship, rises, fades.
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.ageS += dt;
        if (p.ageS >= T.textDurationS || !T.showHitText) {
          p.el.remove();
          popups.splice(i, 1);
          continue;
        }
        const pos = positionOf(p.data.shipId) ?? p.data.position;
        if (!project(pos, focus, cam, sp)) {
          p.el.style.display = "none";
          continue;
        }
        const k = p.ageS / T.textDurationS;
        const rise = T.textRisePx * (1 - (1 - k) * (1 - k));
        const fadeIn = Math.min(1, p.ageS / 0.1);
        const fadeOut = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        p.el.style.display = "";
        p.el.style.opacity = String(fadeIn * fadeOut);
        // Above the ship symbol, clear of its brackets.
        p.el.style.transform = `translate(${sp.x}px, ${sp.y - 26 - p.slot - rise}px) translate(-50%, -100%)`;
      }
    },
    clear() {
      blooms.length = 0;
      sparks.length = 0;
      for (const p of popups) p.el.remove();
      popups.length = 0;
      geo.instanceCount = 0;
    },
  };
}
