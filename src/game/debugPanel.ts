import GUI from "lil-gui";
import { cameraTuning } from "../data/camera";
import { holotableTuning } from "../data/holotable";
import { symbolTuning } from "../data/symbols";
import { effectsTuning } from "../data/effects";
import { navTuning } from "../data/nav";
import { bodyTuning } from "../data/bodies";
import { physicsTuning } from "../data/physics";
import { timeTuning } from "../data/time";
import { torpedoTuning } from "../data/weapons";
import { pathTuning } from "../data/paths";
import { scenarios } from "../data/scenarios";

// Debug panel. Toggle with the backquote key (`).
// Controls edit the tunable objects in src/data directly; code reads them every frame.
export function createDebugPanel(currentScenario: string): GUI {
  const gui = new GUI({ title: "Debug  [ ` ]" });
  gui.hide();

  // Scenario picker: reloads the page with ?scenario=...
  const pick = { scenario: currentScenario };
  gui.add(pick, "scenario", Object.keys(scenarios)).onChange((name: string) => {
    const url = new URL(location.href);
    url.searchParams.set("scenario", name);
    location.href = url.toString();
  });

  gui.add(physicsTuning, "gravityEnabled").name("gravity");

  const time = gui.addFolder("Time");
  time.add(timeTuning, "slowOnFlip").name("slow to 1x on flip");
  time.add(timeTuning, "slowOnOrderComplete").name("slow to 1x on arrival");
  time.add(timeTuning, "maxSimMsPerFrame", 2, 20, 1);
  time.close();

  const nav = gui.addFolder("Nav computer");
  nav.add(navTuning, "alignToleranceDeg", 0.2, 10, 0.1);
  nav.add(navTuning, "arriveDistance", 5, 1000, 5);
  nav.add(navTuning, "arriveSpeed", 0.05, 5, 0.05);
  nav.add(navTuning, "lateralTimeConstant", 1, 30, 0.5);
  nav.add(navTuning, "lateralShare", 0, 1, 0.05);
  nav.add(navTuning, "rendezvousStandoff", 0, 50000, 500);
  nav.add(navTuning, "stationHoldRadius", 100, 20000, 100);
  nav.add(navTuning, "noReturnMargin", 1, 10, 0.1).name("gravity safety factor");
  nav.add(navTuning, "bodyHardMarginMeters", 0, 50000, 100).name("surface clearance (m)");
  nav.add(navTuning, "hoverMinAccel", 0, 0.5, 0.005).name("hover above (m/s²)");
  nav.add(navTuning, "asteroidHardMarginFraction", 0, 1, 0.01).name("asteroid hard limit (x r)");
  nav.add(navTuning, "roundBodyHardMarginFraction", 0, 0.5, 0.01).name("moon hard limit (x r)");
  nav.add(navTuning, "routeClearanceFactor", 1, 1.5, 0.01).name("route clearance (x zone)");
  nav.add(navTuning, "avoidMarginMeters", 0, 20000, 100).name("avoid margin (m)");
  nav.close();

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

  const bodies = gui.addFolder("Bodies");
  bodies.add(bodyTuning, "contourCount", 2, 40, 1);
  bodies.add(bodyTuning, "contourOpacity", 0, 1.5, 0.01);
  bodies.add(bodyTuning, "rimOpacity", 0, 1.5, 0.01);
  bodies.add(bodyTuning, "moonRoughness", 0, 0.2, 0.005);
  bodies.add(bodyTuning, "asteroidRoughness", 0, 0.6, 0.01);
  bodies.add(bodyTuning, "noiseFrequency", 0.3, 5, 0.1);
  bodies.close();

  const fx = gui.addFolder("Effects");
  fx.add(effectsTuning, "enabled");
  fx.add(effectsTuning, "bloomStrength", 0, 3, 0.01);
  fx.add(effectsTuning, "bloomRadius", 0, 1, 0.01);
  fx.add(effectsTuning, "bloomThreshold", 0, 1, 0.01);
  fx.add(effectsTuning, "chromaticPx", 0, 5, 0.05);
  fx.add(effectsTuning, "chromaticRadialPx", 0, 8, 0.05);
  fx.add(effectsTuning, "dustOpacity", 0, 1, 0.01);
  fx.close();

  const torp = gui.addFolder("Torpedoes");
  torp.add(torpedoTuning, "accelG", 5, 60, 1).name("accel (g)");
  torp.add(torpedoTuning, "deltaV", 2000, 40000, 500).name("delta-v (m/s)");
  torp.add(torpedoTuning, "terminalReserve", 0, 10000, 100).name("homing reserve (m/s)");
  torp.add(torpedoTuning, "terminalPhaseS", 5, 120, 1).name("final homing (s)");
  torp.add(torpedoTuning, "fuseRadius", 10, 1000, 10).name("fuse radius (m)");
  torp.add(torpedoTuning, "seekerRange", 10000, 10000000, 10000).name("seeker range (m)");
  torp.add(torpedoTuning, "pointArrival", 1000, 500000, 1000).name("point arrival (m)");
  torp.add(torpedoTuning, "mineLifetimeS", 60, 14400, 60).name("mine lifetime (s)");
  torp.add(torpedoTuning, "coldEjectSpeed", 1, 200, 1).name("cold eject (m/s)");
  torp.add(torpedoTuning, "coldIgnitionDistance", 10000, 10000000, 10000).name("cold ignition (m)");
  torp.add(torpedoTuning, "hotEjectSpeed", 1, 100, 1).name("hot eject (m/s)");
  torp.add(torpedoTuning, "tubeReloadS", 1, 60, 0.5).name("tube reload (s)");
  torp.add(pathTuning, "interceptWidthPx", 0.5, 4, 0.1).name("intercept line (px)");
  torp.add(pathTuning, "interceptOpacity", 0, 1, 0.05).name("intercept line opacity");
  torp.add(pathTuning, "interceptDotScale", 0.0005, 0.02, 0.0005).name("intercept dot size");
  torp.close();

  // Copies all current values as JSON, to paste back into the src/data files.
  gui.add(
    {
      copyValues: () => {
        const json = JSON.stringify({ cameraTuning, holotableTuning, symbolTuning, effectsTuning, navTuning, timeTuning, bodyTuning, physicsTuning, torpedoTuning, pathTuning }, null, 2);
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
