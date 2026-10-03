// Draws every symbol variant once into a texture atlas (white on transparent; color is
// applied per instance). Symbols point up; the icon layer rotates them on screen.

import * as THREE from "three";
import type { SymbolShape } from "./displayList";

export type Treatment = "plain" | "brackets" | "dashed";
export const SHAPES: SymbolShape[] = [
  "corvette", "frigate", "destroyer", "cruiser", "capital", "station", "unknown", "torpedo",
];
const TREATMENTS: Treatment[] = ["plain", "brackets", "dashed"];

const CELL = 128;
const COLS = 8;
const ROWS = 8;
/** Symbol unit radius in atlas pixels. */
const R = CELL * 0.3;
const LINE = 0.15; // line width in units of R

export const EXTRA_CELLS = { select: 48, bodyMarker: 49, flip: 50, arrival: 51, thrust: 52, waypoint: 53 } as const;

export function cellIndex(shape: SymbolShape, filled: boolean, treatment: Treatment): number {
  return SHAPES.indexOf(shape) * 6 + (filled ? 3 : 0) + TREATMENTS.indexOf(treatment);
}

/** UV rectangle (u0, v0, du, dv) of a cell. */
export function cellUv(index: number): [number, number, number, number] {
  const c = index % COLS;
  const r = Math.floor(index / COLS);
  return [c / COLS, 1 - (r + 1) / ROWS, 1 / COLS, 1 / ROWS];
}

type Pt = [number, number];

// Outlines in units of R, pointing up (negative y is up on a canvas).
function chevron(apexY: number, height: number, thick: number, halfW: number): Pt[] {
  const endY = apexY + height;
  return [
    [0, apexY], [halfW, endY - thick], [halfW, endY], [0, apexY + thick], [-halfW, endY], [-halfW, endY - thick],
  ];
}

function shapePaths(shape: SymbolShape): Pt[][] {
  switch (shape) {
    case "frigate":
      return [[[0, -1], [0.78, 0.8], [-0.78, 0.8]]];
    case "corvette":
      return [chevron(-0.85, 1.6, 0.48, 0.85)];
    case "destroyer":
      return [chevron(-1.0, 1.05, 0.36, 0.85), chevron(-0.25, 1.05, 0.36, 0.85)];
    case "cruiser":
      return [[[0, -1.1], [0.45, 0], [0, 1.1], [-0.45, 0]]];
    case "capital":
      return [
        [[0, -1.15], [0.8, 0], [0, 1.15], [-0.8, 0]],
        [[-1.1, -0.1], [1.1, -0.1], [1.1, 0.1], [-1.1, 0.1]],
      ];
    case "station":
      return [[[-0.72, -0.72], [0.72, -0.72], [0.72, 0.72], [-0.72, 0.72]]];
    case "unknown":
      return [[[0, -0.95], [0.95, 0], [0, 0.95], [-0.95, 0]]];
    case "torpedo":
      return []; // drawn as a circle
  }
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  index: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const c = index % COLS;
  const r = Math.floor(index / COLS);
  ctx.save();
  ctx.translate(c * CELL + CELL / 2, r * CELL + CELL / 2);
  ctx.scale(R, R);
  ctx.lineWidth = LINE;
  ctx.lineJoin = "miter";
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  draw(ctx);
  ctx.restore();
}

function brackets(ctx: CanvasRenderingContext2D, half: number, arm: number) {
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(sx * half, sy * (half - arm));
    ctx.lineTo(sx * half, sy * half);
    ctx.lineTo(sx * (half - arm), sy * half);
  }
  ctx.stroke();
}

function drawSymbol(ctx: CanvasRenderingContext2D, shape: SymbolShape, filled: boolean, treatment: Treatment) {
  ctx.setLineDash(treatment === "dashed" ? [0.32, 0.2] : []);
  if (shape === "torpedo") {
    ctx.beginPath();
    ctx.arc(0, 0, 0.75, 0, Math.PI * 2);
    if (filled) ctx.fill();
    else {
      ctx.lineWidth = LINE * 2;
      ctx.beginPath();
      ctx.arc(0, 0, 0.65, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }
  for (const path of shapePaths(shape)) {
    ctx.beginPath();
    path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    if (filled) {
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
  }
  if (shape === "unknown") {
    ctx.setLineDash([]);
    ctx.font = "bold 1.05px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (filled) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillText("?", 0, 0.06);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.fillText("?", 0, 0.06);
    }
  }
  if (treatment === "brackets") brackets(ctx, 1.45, 0.42);
}

export function createSymbolAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * COLS;
  canvas.height = CELL * ROWS;
  const ctx = canvas.getContext("2d")!;

  for (const shape of SHAPES) {
    for (const filled of [false, true]) {
      for (const t of TREATMENTS) {
        drawCell(ctx, cellIndex(shape, filled, t), (c) => drawSymbol(c, shape, filled, t));
      }
    }
  }
  // Selection reticle: wide corner brackets.
  drawCell(ctx, EXTRA_CELLS.select, (c) => {
    c.lineWidth = LINE * 0.9;
    brackets(c, 1.6, 0.5);
  });
  // Body marker for bodies too small to see: ring with a center dot.
  drawCell(ctx, EXTRA_CELLS.bodyMarker, (c) => {
    c.beginPath();
    c.arc(0, 0, 0.8, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 0.18, 0, Math.PI * 2);
    c.fill();
  });

  // Flip marker: two rotating arrows around a circle.
  drawCell(ctx, EXTRA_CELLS.flip, (c) => {
    c.lineWidth = LINE * 1.1;
    for (const start of [0.15, Math.PI + 0.15]) {
      const end = start + Math.PI - 0.5;
      c.beginPath();
      c.arc(0, 0, 0.85, start, end);
      c.stroke();
      const ex = Math.cos(end) * 0.85, ey = Math.sin(end) * 0.85;
      const tx = -Math.sin(end), ty = Math.cos(end); // tangent, direction of travel
      const nx = Math.cos(end), ny = Math.sin(end);
      c.beginPath();
      c.moveTo(ex + tx * 0.38, ey + ty * 0.38);
      c.lineTo(ex + nx * 0.26, ey + ny * 0.26);
      c.lineTo(ex - nx * 0.26, ey - ny * 0.26);
      c.closePath();
      c.fill();
    }
  });
  // Arrival ring: circle with four ticks pointing in.
  drawCell(ctx, EXTRA_CELLS.arrival, (c) => {
    c.beginPath();
    c.arc(0, 0, 1.0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.moveTo(x * 1.0, y * 1.0);
      c.lineTo(x * 0.62, y * 0.62);
    }
    c.stroke();
  });
  // Thrust line: from just outside the icon, pointing up (forward).
  drawCell(ctx, EXTRA_CELLS.thrust, (c) => {
    c.lineWidth = LINE * 1.3;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(0, -0.95);
    c.lineTo(0, -1.6);
    c.stroke();
  });
  // Waypoint: small crosshair.
  drawCell(ctx, EXTRA_CELLS.waypoint, (c) => {
    c.beginPath();
    c.arc(0, 0, 0.45, 0, Math.PI * 2);
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.moveTo(x * 0.6, y * 0.6);
      c.lineTo(x * 1.2, y * 1.2);
    }
    c.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}
