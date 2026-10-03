import GUI from "lil-gui";
import type { TableView } from "../render/scene";
import { cameraTuning } from "../data/camera";

// Debug panel. Toggle with the backquote key (`).
export function createDebugPanel(view: TableView): GUI {
  const gui = new GUI({ title: "Debug  [ ` ]" });
  gui.hide();

  const cam = gui.addFolder("Camera");
  cam.add(cameraTuning, "rotateSpeed", 0.1, 3, 0.05).onChange((v: number) => {
    view.controls.rotateSpeed = v;
  });
  cam.add(cameraTuning, "zoomSpeed", 0.1, 5, 0.05).onChange((v: number) => {
    view.controls.zoomSpeed = v;
  });
  cam.add(cameraTuning, "dampingFactor", 0.01, 0.5, 0.01).onChange((v: number) => {
    view.controls.dampingFactor = v;
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "`") gui.show(gui._hidden);
  });

  return gui;
}
