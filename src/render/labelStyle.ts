// Pushes the table text sizes (data/labels.ts) to CSS variables the stylesheet reads. Cheap
// enough to call every frame; it only touches the DOM when a size changed.

import { labelTuning as L } from "../data/labels";

/** Line height of floating hit text for the current size, in px. */
export const hitTextLinePx = () => Math.round(L.hitTextPx * 1.2);

let last = "";

export function applyLabelStyle(): void {
  const key = `${L.axisPx}|${L.ringPx}|${L.scaleReadoutPx}|${L.hitTextPx}`;
  if (key === last) return;
  last = key;
  const s = document.documentElement.style;
  s.setProperty("--label-axis-px", `${L.axisPx}px`);
  s.setProperty("--label-ring-px", `${L.ringPx}px`);
  s.setProperty("--label-scale-px", `${L.scaleReadoutPx}px`);
  s.setProperty("--label-hit-px", `${L.hitTextPx}px`);
  s.setProperty("--label-hit-line", `${hitTextLinePx()}px`);
}
