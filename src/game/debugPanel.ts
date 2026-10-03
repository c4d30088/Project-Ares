import GUI from "lil-gui";
import { cameraTuning } from "../data/camera";
import { holotableTuning } from "../data/holotable";
import { symbolTuning } from "../data/symbols";
import { effectsTuning } from "../data/effects";

// Debug panel. Toggle with the backquote key (`).
// Controls edit the tunable objects in src/data directly; code reads them every frame.
export function createDebugPanel(): GUI {
  const gui = new GUI({ title: "Debug  [ ` ]" });
  gui.hide();

  const cam = gui.addFolder("Camera");
  cam.add(cameraTuning, "fovDeg", 20, 90, 1);
  cam.add(cameraTuning, "rotateSpeed", 0.05, 1.5, 0.01);
  cam.add(cameraTuning, "zoomSpeed", 0.2, 4, 0.05);
  cam.add(cameraTuning, "dampingFactor", 0.02, 1, 0.01);
  cam.close();

  const table = gui.addFolder("Holotable");
  table.add(holotableTuning, "gridDensity", 0.02, 0.5, 0.01);
  table.add(holotableTuning, "boxScale", 0.15, 1, 0.01);
  table.add(holotableTuning, "boxHeightRatio", 0.1, 1, 0.01);
  table.add(holotableTuning, "gridOpacity", 0, 2, 0.01);
  table.add(holotableTuning, "ringOpacity", 0, 1, 0.01);
  table.add(holotableTuning, "axisOpacity", 0, 1, 0.01);
  table.add(holotableTuning, "boxOpacity", 0, 1, 0.01);
  table.add(holotableTuning, "edgeFade", 0, 1, 0.01);
  table.add(holotableTuning, "ringCount", 2, 16, 1);
  table.add(holotableTuning, "showBackWalls");
  table.add(holotableTuning, "wallOpacity", 0, 1, 0.01);
  table.add(holotableTuning, "showRangeSpheres");
  table.add(holotableTuning, "sphereOpacity", 0, 1, 0.01);
  table.add(holotableTuning, "dropLineOpacity", 0, 1, 0.01);
  table.add(holotableTuning, "torpedoDropLineOpacity", 0, 1, 0.01);
  table.add(holotableTuning, "bodyDropLineOpacity", 0, 1, 0.01);
  table.add(holotableTuning, "footRingPx", 0, 15, 0.5);
  table.add(holotableTuning, "dashScale", 0.001, 0.03, 0.001);
  table.close();

  const sym = gui.addFolder("Symbols");
  sym.add(symbolTuning, "scale", 0.5, 2, 0.05);
  for (const k of Object.keys(symbolTuning.size) as (keyof typeof symbolTuning.size)[]) {
    sym.add(symbolTuning.size, k, 6, 80, 1).name(`size: ${k}`);
  }
  sym.add(symbolTuning, "torpedoPulseHz", 0, 5, 0.1);
  sym.add(symbolTuning, "pulseMin", 0, 1, 0.01);
  sym.add(symbolTuning, "bodyOpacity", 0, 1, 0.01);
  sym.add(symbolTuning, "labelOpacity", 0, 1, 0.01);
  sym.close();

  const fx = gui.addFolder("Effects");
  fx.add(effectsTuning, "enabled");
  fx.add(effectsTuning, "bloomStrength", 0, 3, 0.01);
  fx.add(effectsTuning, "bloomRadius", 0, 1, 0.01);
  fx.add(effectsTuning, "bloomThreshold", 0, 1, 0.01);
  fx.add(effectsTuning, "chromaticPx", 0, 5, 0.05);
  fx.add(effectsTuning, "chromaticRadialPx", 0, 8, 0.05);
  fx.add(effectsTuning, "dustOpacity", 0, 1, 0.01);
  fx.close();

  // Copies all current values as JSON, to paste back into the src/data files.
  gui.add(
    {
      copyValues: () => {
        const json = JSON.stringify({ cameraTuning, holotableTuning, symbolTuning, effectsTuning }, null, 2);
        void navigator.clipboard.writeText(json);
      },
    },
    "copyValues",
  ).name("copy values");

  window.addEventListener("keydown", (e) => {
    if (e.key === "`") gui.show(gui._hidden);
  });

  return gui;
}
