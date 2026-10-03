import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { palette } from "./palette";
import { cameraTuning, placeholderGrid } from "../data/camera";

export interface TableView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  render(): void;
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

  const camera = new THREE.PerspectiveCamera(
    cameraTuning.fovDeg,
    1,
    0.1,
    cameraTuning.maxDistance * 10,
  );
  const d = cameraTuning.startDistance;
  camera.position.set(d * 0.6, d * 0.45, d * 0.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = cameraTuning.dampingFactor;
  controls.rotateSpeed = cameraTuning.rotateSpeed;
  controls.zoomSpeed = cameraTuning.zoomSpeed;
  controls.minDistance = cameraTuning.minDistance;
  controls.maxDistance = cameraTuning.maxDistance;

  const grid = new THREE.GridHelper(
    placeholderGrid.size,
    placeholderGrid.divisions,
    palette.grid,
    palette.grid,
  );
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = placeholderGrid.opacity;
  scene.add(grid);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  return {
    renderer,
    scene,
    camera,
    controls,
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
  };
}
