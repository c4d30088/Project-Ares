import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createTableView } from "./render/scene";
import { createDebugPanel } from "./game/debugPanel";
import { Hud } from "./ui/Hud";

const view = createTableView(document.getElementById("table")!);
createDebugPanel(view);
createRoot(document.getElementById("hud")!).render(createElement(Hud));

let firstFrame = true;
function frame() {
  view.render();
  if (firstFrame) {
    firstFrame = false;
    // Signals the screenshot script that the scene has rendered.
    (window as unknown as { __aresReady: boolean }).__aresReady = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
