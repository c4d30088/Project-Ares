// Orbit camera for the holotable: rotate, pan in the reference plane, logarithmic zoom,
// animated focus changes and a top-down snap. The camera always sits around the
// three.js origin; the focus point lives in sim coordinates (floating origin).

import * as THREE from "three";
import { cameraTuning as T } from "../data/camera";
import type { Vec3 } from "../sim/vec3";

const DEG = Math.PI / 180;
const CLICK_SLOP_PX = 4;

export interface TableCamera {
  camera: THREE.PerspectiveCamera;
  /** Current focus in sim coordinates. Read every frame by the renderer. */
  readonly focus: Vec3;
  readonly distance: number;
  /** Moves the focus to p. With animate, glides there from the current focus. */
  setFocus(p: Vec3, animate?: boolean): void;
  /** Moves the focus anchor without restarting any glide in progress (for following a
   *  moving object every frame). */
  setAnchor(p: Vec3): void;
  /** Called when the player pans, so the game can stop following an object. */
  onPan: (() => void) | null;
  /** When false, left-drag does not rotate and left-click does not select (order input). */
  leftDragEnabled: boolean;
  toggleTopDown(): void;
  setView(v: { yawDeg?: number; pitchDeg?: number; distance?: number }, animate?: boolean): void;
  update(dt: number): void;
  onClick: ((x: number, y: number) => void) | null;
  resize(w: number, h: number): void;
}

export function createTableCamera(dom: HTMLElement): TableCamera {
  const camera = new THREE.PerspectiveCamera(T.fovDeg, 1, 0.5, 1e13);

  // Current and target state. Distance is damped in log space so zoom feels even at every scale.
  // Focus = anchor + offset. The anchor can follow a moving ship exactly; the offset glides
  // to zero after a focus change, so the camera never lags behind a fast ship.
  const focus: Vec3 = { x: 0, y: 0, z: 0 };
  const anchor: Vec3 = { x: 0, y: 0, z: 0 };
  const offset: Vec3 = { x: 0, y: 0, z: 0 };
  let yaw = T.startYawDeg * DEG, yawTarget = yaw;
  let pitch = T.startPitchDeg * DEG, pitchTarget = pitch;
  let logDist = Math.log(T.startDistance), logDistTarget = logDist;
  let pitchBeforeTopDown: number | null = null;

  const clampPitch = (p: number) => Math.max(-89.9 * DEG, Math.min(89.9 * DEG, p));
  const clampLogDist = (d: number) => Math.max(Math.log(T.minDistance), Math.min(Math.log(T.maxDistance), d));

  // --- input ---
  let dragMode: "rotate" | "pan" | null = null;
  let downX = 0, downY = 0, lastX = 0, lastY = 0, moved = false;

  dom.addEventListener("contextmenu", (e) => e.preventDefault());
  dom.addEventListener("pointerdown", (e) => {
    dom.setPointerCapture(e.pointerId);
    dragMode = e.button === 2 || e.shiftKey ? "pan" : e.button === 0 && api.leftDragEnabled ? "rotate" : null;
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    moved = false;
  });
  dom.addEventListener("pointermove", (e) => {
    if (!dragMode) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_SLOP_PX) moved = true;
    if (dragMode === "rotate") {
      yawTarget -= dx * T.rotateSpeed * DEG;
      pitchTarget = clampPitch(pitchTarget + dy * T.rotateSpeed * DEG);
      pitchBeforeTopDown = null;
    } else {
      pan(dx, dy);
    }
  });
  dom.addEventListener("pointerup", (e) => {
    dom.releasePointerCapture(e.pointerId);
    if (dragMode && !moved && e.button === 0) api.onClick?.(e.clientX, e.clientY);
    dragMode = null;
  });
  dom.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const steps = e.deltaMode === 1 ? e.deltaY / 3 : e.deltaY / 100;
      logDistTarget = clampLogDist(logDistTarget + steps * 0.15 * T.zoomSpeed);
    },
    { passive: false },
  );

  // Pan moves the focus across the reference plane, like dragging a map.
  function pan(dx: number, dy: number) {
    const metersPerPx = (2 * Math.exp(logDist) * Math.tan((T.fovDeg * DEG) / 2)) / dom.clientHeight;
    // Screen right and screen "up" projected onto the plane, in sim axes (Z up).
    const rightX = Math.cos(yaw), rightY = Math.sin(yaw);
    const fwdX = -Math.sin(yaw), fwdY = Math.cos(yaw);
    // When looking nearly straight down, screen up maps fully to forward; at low angles
    // the plane is foreshortened, so stretch forward motion to keep the grid under the cursor.
    const fwdScale = 1 / Math.max(0.2, Math.sin(Math.abs(pitch)));
    anchor.x += (-dx * rightX + dy * fwdX * fwdScale) * metersPerPx;
    anchor.y += (-dx * rightY + dy * fwdY * fwdScale) * metersPerPx;
    api.onPan?.();
  }

  const api: TableCamera = {
    camera,
    focus,
    get distance() {
      return Math.exp(logDist);
    },
    onClick: null,
    onPan: null,
    leftDragEnabled: true,
    setFocus(p, animate = true) {
      if (animate) {
        offset.x = focus.x - p.x;
        offset.y = focus.y - p.y;
        offset.z = focus.z - p.z;
      } else {
        offset.x = offset.y = offset.z = 0;
      }
      anchor.x = p.x;
      anchor.y = p.y;
      anchor.z = p.z;
      focus.x = anchor.x + offset.x;
      focus.y = anchor.y + offset.y;
      focus.z = anchor.z + offset.z;
    },
    setAnchor(p) {
      anchor.x = p.x;
      anchor.y = p.y;
      anchor.z = p.z;
      focus.x = anchor.x + offset.x;
      focus.y = anchor.y + offset.y;
      focus.z = anchor.z + offset.z;
    },
    toggleTopDown() {
      if (pitchBeforeTopDown === null) {
        pitchBeforeTopDown = pitchTarget;
        pitchTarget = T.topDownPitchDeg * DEG;
      } else {
        pitchTarget = pitchBeforeTopDown;
        pitchBeforeTopDown = null;
      }
    },
    setView(v, animate = true) {
      if (v.yawDeg !== undefined) yawTarget = v.yawDeg * DEG;
      if (v.pitchDeg !== undefined) pitchTarget = clampPitch(v.pitchDeg * DEG);
      if (v.distance !== undefined) logDistTarget = clampLogDist(Math.log(v.distance));
      if (!animate) {
        yaw = yawTarget;
        pitch = pitchTarget;
        logDist = logDistTarget;
      }
    },
    update(dt) {
      const k = 1 - Math.pow(1 - T.dampingFactor, dt * 60);
      yaw += (yawTarget - yaw) * k;
      pitch += (pitchTarget - pitch) * k;
      logDist += (logDistTarget - logDist) * k;
      offset.x -= offset.x * k;
      offset.y -= offset.y * k;
      offset.z -= offset.z * k;
      focus.x = anchor.x + offset.x;
      focus.y = anchor.y + offset.y;
      focus.z = anchor.z + offset.z;

      // Camera position around the origin. Sim yaw is measured in the X/Y plane;
      // three.js axes are (x, z_up, -y).
      const d = Math.exp(logDist);
      const sx = Math.sin(yaw) * Math.cos(pitch);
      const sy = -Math.cos(yaw) * Math.cos(pitch);
      const sz = Math.sin(pitch);
      camera.position.set(sx * d, sz * d, -sy * d);
      camera.up.set(0, 1, 0);
      // Keep "up" stable when looking straight down: orient by yaw instead.
      if (Math.abs(pitch) > 89 * DEG) camera.up.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      camera.lookAt(0, 0, 0);
      // Update matrices now so icons projected this frame line up with the 3D scene.
      camera.updateMatrixWorld();
      camera.near = Math.max(0.1, d * 1e-4);
      camera.far = d * 1e4 + 1e12;
      camera.fov = T.fovDeg;
      camera.updateProjectionMatrix();
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  };
  return api;
}
