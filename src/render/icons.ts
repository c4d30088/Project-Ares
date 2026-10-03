// Screen-space symbol layer. Every object is projected to the screen each frame and drawn
// as a constant-size, camera-facing icon in an orthographic overlay scene (pixel units).
// Also positions the name labels and answers "what is under this pixel?" for picking.

import * as THREE from "three";
import { symbolTuning as T } from "../data/symbols";
import type { Allegiance } from "../sim/sensors/picture";
import type { Vec3 } from "../sim/vec3";
import type { DisplayList } from "./displayList";
import { toRender } from "./frame";
import { palette } from "./palette";
import { cellIndex, cellUv, createSymbolAtlas, EXTRA_CELLS, type Treatment } from "./symbolAtlas";

const MAX_ICONS = 512;

const vertex = /* glsl */ `
  attribute vec2 iPos;
  attribute float iSize;
  attribute float iAngle;
  attribute vec4 iUv;
  attribute vec4 iColor;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float c = cos(iAngle), s = sin(iAngle);
    vec2 p = position.xy * iSize;
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + iPos;
    vUv = iUv.xy + (position.xy + 0.5) * iUv.zw;
    vColor = iColor;
    gl_Position = projectionMatrix * vec4(p, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float a = texture2D(uAtlas, vUv).a * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
    #include <colorspace_fragment>
  }
`;

export const allegianceColor: Record<Allegiance, string> = {
  friendly: palette.friendly,
  neutral: palette.neutral,
  hostile: palette.hostile,
  unknown: palette.uncertain,
};

const treatmentFor: Record<Allegiance, Treatment> = {
  friendly: "plain",
  neutral: "plain",
  hostile: "brackets",
  unknown: "dashed",
};

export interface ScreenItem {
  id: string;
  x: number; // px from left
  y: number; // px from top
  radius: number; // pick radius, px
  visible: boolean;
}

export interface IconLayer {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  update(list: DisplayList, focus: Vec3, camera: THREE.PerspectiveCamera, selectedId: string | null, timeSec: number): void;
  pick(x: number, y: number): string | null;
  resize(w: number, h: number): void;
}

export function createIconLayer(labelRoot: HTMLElement): IconLayer {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  let width = 1, height = 1;

  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute("position", quad.getAttribute("position"));
  const attr = (name: string, size: number) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ICONS * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const aPos = attr("iPos", 2);
  const aSize = attr("iSize", 1);
  const aAngle = attr("iAngle", 1);
  const aUv = attr("iUv", 4);
  const aColor = attr("iColor", 4);

  const material = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: createSymbolAtlas() } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // Label pool.
  const labels = new Map<string, HTMLDivElement>();
  const labelFor = (id: string) => {
    let el = labels.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = "obj-label";
      labelRoot.appendChild(el);
      labels.set(id, el);
    }
    return el;
  };

  const screen: ScreenItem[] = [];
  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const color = new THREE.Color();

  // Projects a render-space point to screen px (origin top-left). Returns false if behind the camera.
  function project(p: THREE.Vector3, cam: THREE.PerspectiveCamera, out: { x: number; y: number }): boolean {
    v2.copy(p).applyMatrix4(cam.matrixWorldInverse);
    if (v2.z > -cam.near) return false;
    v2.applyMatrix4(cam.projectionMatrix);
    out.x = (v2.x * 0.5 + 0.5) * width;
    out.y = (-v2.y * 0.5 + 0.5) * height;
    return true;
  }

  let count = 0;
  function push(x: number, y: number, size: number, angle: number, cell: number, hex: string, alpha: number) {
    if (count >= MAX_ICONS) return;
    const i = count++;
    aPos.setXY(i, x - width / 2, height / 2 - y);
    aSize.setX(i, size);
    aAngle.setX(i, angle);
    aUv.setXYZW(i, ...cellUv(cell));
    color.set(hex);
    aColor.setXYZW(i, color.r, color.g, color.b, alpha);
  }

  const sp = { x: 0, y: 0 };
  const sp2 = { x: 0, y: 0 };
  const seen = new Set<string>();

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
    update(list, focus, cam, selectedId, time) {
      count = 0;
      screen.length = 0;
      seen.clear();
      const pulse = T.pulseMin + (1 - T.pulseMin) * (0.5 + 0.5 * Math.cos(time * Math.PI * 2 * T.torpedoPulseHz));
      const pxPerRad = height / 2 / Math.tan((cam.fov * Math.PI) / 360);

      // Bodies too small to see as spheres get a marker.
      for (const b of list.bodies) {
        toRender(b.position, focus, v);
        const visible = project(v, cam, sp);
        const dist = v.distanceTo(cam.position);
        const rPx = (b.radius / Math.max(dist, 1)) * pxPerRad;
        screen.push({ id: b.id, x: sp.x, y: sp.y, radius: Math.max(T.pickRadiusPx, rPx), visible });
        const el = labelFor(b.id);
        seen.add(b.id);
        el.style.display = visible ? "" : "none";
        if (!visible) continue;
        if (rPx < T.bodyMarkerBelowPx) push(sp.x, sp.y, T.bodyMarkerSize * T.scale, 0, EXTRA_CELLS.bodyMarker, palette.chrome, 0.8);
        el.textContent = b.name;
        el.style.color = palette.textDim;
        el.style.opacity = b.kind === "asteroid" ? "0.6" : "0.9";
        const off = Math.max(rPx, (T.bodyMarkerSize * T.scale) / 3);
        el.style.transform = `translate(${sp.x + off * 0.72 + 4}px, ${sp.y + off * 0.72}px)`;
      }

      for (const s of list.symbols) {
        toRender(s.position, focus, v);
        const visible = project(v, cam, sp);
        const size = T.size[s.shape] * T.scale;
        screen.push({ id: s.id, x: sp.x, y: sp.y, radius: Math.max(T.pickRadiusPx, size * 0.4), visible });
        if (s.label) {
          const el = labelFor(s.id);
          seen.add(s.id);
          el.style.display = visible ? "" : "none";
          if (visible) {
            el.textContent = s.label;
            el.style.color = allegianceColor[s.allegiance];
            el.style.opacity = String(T.labelOpacity);
            el.style.transform = `translate(${sp.x + size * 0.42}px, ${sp.y - 6}px)`;
          }
        }
        if (!visible) continue;

        // Screen angle of the pointing direction. 0 = icon points up.
        let angle = 0;
        if (s.rotates) {
          const L = 1e-3 * cam.position.length() + 1;
          const d = s.pointing;
          const n = Math.hypot(d.x, d.y, d.z) || 1;
          toRender({ x: s.position.x + (d.x / n) * L, y: s.position.y + (d.y / n) * L, z: s.position.z + (d.z / n) * L }, focus, v);
          if (project(v, cam, sp2)) {
            const dx = sp2.x - sp.x, dy = sp2.y - sp.y;
            if (dx * dx + dy * dy > 1e-6) angle = Math.atan2(dx, -dy) * -1;
          }
        }

        let hex = allegianceColor[s.allegiance];
        let alpha = 1;
        if (s.shape === "torpedo" && s.allegiance === "hostile") {
          hex = palette.threat;
          alpha = pulse;
        }
        const treatment = s.shape === "torpedo" ? "plain" : treatmentFor[s.allegiance];
        push(sp.x, sp.y, size, angle, cellIndex(s.shape, s.filled, treatment), hex, alpha);
      }

      // Selection reticle on top.
      const sel = selectedId && screen.find((it) => it.id === selectedId && it.visible);
      if (sel) push(sel.x, sel.y, Math.max(34, sel.radius * 2.6), 0, EXTRA_CELLS.select, palette.text, 0.9);

      for (const [id, el] of labels) if (!seen.has(id)) el.style.display = "none";

      geo.instanceCount = count;
      for (const a of [aPos, aSize, aAngle, aUv, aColor]) a.needsUpdate = true;
    },
    pick(x, y) {
      let best: string | null = null;
      let bestD = Infinity;
      for (const it of screen) {
        if (!it.visible) continue;
        const d = Math.hypot(it.x - x, it.y - y);
        // Prefer small symbols over a large body behind them.
        const score = d / it.radius;
        if (d <= it.radius && score < bestD) {
          bestD = score;
          best = it.id;
        }
      }
      return best;
    },
  };
}
