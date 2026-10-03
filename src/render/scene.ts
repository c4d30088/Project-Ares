import * as THREE from "three";
import { palette } from "./palette";
import { createTableCamera, type TableCamera } from "./camera";

export interface TableView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cam: TableCamera;
  dom: HTMLElement;
  render(dt: number): void;
}

export function createTableView(container: HTMLElement): TableView {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true,
    preserveDrawingBuffer: true, // lets the screenshot script read the canvas
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(palette.bg);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const cam = createTableCamera(renderer.domElement);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    cam.resize(w, h);
  };
  window.addEventListener("resize", resize);
  resize();

  return {
    renderer,
    scene,
    cam,
    dom: renderer.domElement,
    render(dt) {
      cam.update(dt);
      renderer.render(scene, cam.camera);
    },
  };
}
