import * as THREE from "three";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { palette } from "./palette";
import { createTableCamera, type TableCamera } from "./camera";
import { createDust, createEffects, type Effects } from "./effects";
import { settings } from "../game/settings";

export interface TableView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cam: TableCamera;
  dom: HTMLElement;
  /** Screen-fixed overlay inside the table area, for readouts. */
  overlay: HTMLElement;
  /** Renders the 3D table, then each overlay (scene, camera) pair on top, then effects.
   *  The overlay list must stay the same between calls. */
  render(overlays?: [THREE.Scene, THREE.Camera][]): void;
  /** Called on resize with the table size in CSS pixels. */
  onResize: ((w: number, h: number) => void) | null;
  /** Hit flicker, 0..1: the picture stutters and tears, and the table's labels jitter. */
  setGlitch(amount: number): void;
}

export function createTableView(container: HTMLElement): TableView {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true,
    preserveDrawingBuffer: true, // lets the screenshot script read the canvas
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(palette.bg);
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);

  // Labels attached to 3D positions (names, axis letters, ring distances).
  const labels = new CSS2DRenderer();
  labels.domElement.className = "table-labels";
  container.appendChild(labels.domElement);

  const overlay = document.createElement("div");
  overlay.className = "table-overlay";
  container.appendChild(overlay);

  const scene = new THREE.Scene();
  // Set as the scene background (not only the clear color) so three.js converts it to the
  // right color space when clearing the post-processing buffers.
  scene.background = new THREE.Color(palette.bg);
  const cam = createTableCamera(renderer.domElement);
  const dust = createDust(scene);
  let effects: Effects | null = null;
  let size = { w: 1, h: 1 };
  // Hit flicker: the strength stutters at random, a new step every few tens of milliseconds.
  let glitchSeed = 0;
  let glitchStutter = 1;
  let glitchNext = 0;

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    cam.resize(w, h);
    size = { w, h };
    effects?.resize(w, h);
    api?.onResize?.(w, h);
  };
  window.addEventListener("resize", resize);

  // eslint-disable-next-line prefer-const
  let api: TableView | null = null;
  api = {
    renderer,
    scene,
    cam,
    dom: renderer.domElement,
    overlay,
    onResize: null,
    setGlitch(amount) {
      const now = performance.now();
      if (now >= glitchNext) {
        glitchSeed = Math.random() * 100;
        glitchStutter = 0.35 + 0.65 * Math.random();
        glitchNext = now + 30 + Math.random() * 45;
      }
      const g = amount > 0.001 && !settings.reduceEffects ? amount * glitchStutter : 0;
      effects?.setGlitch(g, glitchSeed);
      // The DOM labels on the table flicker and jitter with the picture (hud.css).
      container.style.setProperty("--glitch", g.toFixed(3));
      container.style.setProperty("--glitch-x", `${((glitchSeed % 2) - 1) * g * 3}px`);
    },
    render(overlays = []) {
      if (!effects) {
        effects = createEffects(renderer, scene, cam.camera, overlays);
        effects.resize(size.w, size.h);
      }
      dust.update(cam.distance);
      effects.render();
      labels.render(scene, cam.camera);
    },
  };
  resize();
  return api;
}
