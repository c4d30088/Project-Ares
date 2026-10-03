import GUI from "lil-gui";
import { cameraTuning } from "../data/camera";

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

  window.addEventListener("keydown", (e) => {
    if (e.key === "`") gui.show(gui._hidden);
  });

  return gui;
}
