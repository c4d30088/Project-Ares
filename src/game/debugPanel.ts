import GUI from "lil-gui";
import { cameraTuning } from "../data/camera";
import { holotableTuning } from "../data/holotable";
import { symbolTuning } from "../data/symbols";
import { effectsTuning } from "../data/effects";
import { navTuning } from "../data/nav";
import { bodyTuning } from "../data/bodies";
import { physicsTuning } from "../data/physics";
import { timeTuning } from "../data/time";
import { pdcTuning, railgunTuning, torpedoTuning } from "../data/weapons";
import { aiTuning } from "../data/ai";
import { sensorTuning } from "../data/sensors";
import { crewTuning } from "../data/crew";
import { pathTuning } from "../data/paths";
import { impactTuning } from "../data/impacts";
import { labelTuning } from "../data/labels";
import { scenarios } from "../data/scenarios";
import { tuningRoots } from "../data/tuningRoots";
import { decoratePanel } from "./panelSearch";
import { applyPanelStyle, loadPanelStyle, panelFonts, panelStyle, resetPanelStyle } from "./panelStyle";

// Debug panel. Toggle with the backquote key (`).
// Controls edit the tunable objects in src/data directly; code reads them every frame.
export function createDebugPanel(currentScenario: string, restart: () => void): GUI {
  loadPanelStyle();
  const gui = new GUI({ title: "Debug  [ ` ]", width: panelStyle.widthPx });
  gui.hide();

  // Scenario picker: reloads the page with ?scenario=...
  const pick = { scenario: currentScenario };
  const options = Object.keys(scenarios);
  if (!options.includes(currentScenario)) options.unshift(currentScenario);
  gui.add(pick, "scenario", options).onChange((name: string) => {
    const url = new URL(location.href);
    url.searchParams.set("scenario", name);
    location.href = url.toString();
  });

  gui.add({ restart }, "restart").name("restart scenario");
  gui.add({ showNotes: true }, "showNotes")
    .name("show explanations")
    .onChange((on: boolean) => gui.domElement.classList.toggle("ares-hide-notes", !on));
  gui.add(physicsTuning, "gravityEnabled").name("gravity");

  // The panel's own look: type scale, explanation size, width, font. Remembered across reloads.
  const look = gui.addFolder("Panel text");
  const restyle = () => applyPanelStyle(gui);
  look.add(panelStyle, "textPx", 8, 22, 1).name("text size (px)").onChange(restyle);
  look.add(panelStyle, "notePx", 7, 18, 1).name("explanation size (px)").onChange(restyle);
  look.add(panelStyle, "widthPx", 260, 760, 10).name("panel width (px)").onChange(restyle);
  look.add(panelStyle, "font", Object.keys(panelFonts)).name("font").onChange(restyle);
  look.add(
    {
      resetLook: () => {
        resetPanelStyle();
        look.controllersRecursive().forEach((c) => c.updateDisplay());
        restyle();
      },
    },
    "resetLook",
  ).name("reset panel text");
  look.close();

  const time = gui.addFolder("Time");
  time.add(timeTuning, "slowOnFlip").name("slow to 1x on flip");
  time.add(timeTuning, "slowOnOrderComplete").name("slow to 1x on arrival");
  time.add(timeTuning, "slowOnContact").name("slow to 1x on new contact");
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

  // Predicted routes for our ships: solid where burning, dashed where coasting.
  const routes = gui.addFolder("Ship routes");
  routes.add(pathTuning, "burnWidthPx", 0.5, 6, 0.1).name("burning line (px)");
  routes.add(pathTuning, "burnOpacity", 0, 1, 0.05).name("burning opacity");
  routes.add(pathTuning, "coastWidthPx", 0.5, 6, 0.1).name("coasting line (px)");
  routes.add(pathTuning, "coastOpacity", 0, 1, 0.05).name("coasting opacity");
  routes.add(pathTuning, "dashScale", 0.001, 0.03, 0.001).name("coast dash length");
  routes.close();

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

  // Text drawn on the table itself: ship labels, countdowns, names, axis and ring labels.
  const text = gui.addFolder("Table text");
  text.add(labelTuning, "shipPx", 7, 24, 1).name("ship labels (px)");
  text.add(labelTuning, "markerPx", 7, 24, 1).name("countdown labels (px)");
  text.add(labelTuning, "bodyPx", 7, 24, 1).name("planet and moon names (px)");
  text.add(labelTuning, "axisPx", 7, 28, 1).name("X Y Z letters (px)");
  text.add(labelTuning, "ringPx", 7, 24, 1).name("ring distances (px)");
  text.add(labelTuning, "scaleReadoutPx", 7, 24, 1).name("scale readout (px)");
  text.add(labelTuning, "hitTextPx", 7, 24, 1).name("hit text (px)");
  text.close();

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
  torp.add(torpedoTuning, "salvoHold").name("salvo hold (arrive together)");
  torp.add(torpedoTuning, "effectiveRange", 100000, 20000000, 100000).name("range ring (m)");
  torp.add(pathTuning, "interceptWidthPx", 0.5, 4, 0.1).name("intercept line (px)");
  torp.add(pathTuning, "interceptOpacity", 0, 1, 0.05).name("intercept line opacity");
  torp.add(pathTuning, "interceptDotScale", 0.0005, 0.02, 0.0005).name("intercept dot size");
  torp.close();

  const sen = gui.addFolder("Sensors");
  sen.add(sensorTuning, "godView").name("God view (show ground truth)");
  sen.add(sensorTuning, "proximityRange", 10000, 10000000, 10000).name("always seen within (m)");
  sen.add(sensorTuning, "sensorRange", 100000, 50000000, 100000).name("sensors find dark within (m)");
  sen.add(sensorTuning, "plumeFadeS", 0, 120, 1).name("loud after drive stops (s)");
  sen.add(sensorTuning, "firedLoudS", 0, 120, 1).name("loud after firing (s)");
  sen.add(sensorTuning, "lostAfterS", 0, 30, 0.5).name("lost after unseen (s)");
  sen.add(sensorTuning, "lostFadeS", 10, 3600, 10).name("lost marker fades over (s)");
  sen.add(sensorTuning, "startSensorsOn").name("ships start with sensors on");
  sen.add(pathTuning, "lostSymbolOpacity", 0, 1, 0.05).name("lost contact brightness");
  sen.add(pathTuning, "lostCourseS", 0, 3600, 30).name("lost course line ahead (s)");
  sen.add(pathTuning, "lostCourseOpacity", 0, 1, 0.05).name("lost course line opacity");
  sen.close();

  const rings = gui.addFolder("Weapon range rings");
  rings.add(pathTuning, "showOwnRings").name("our ships' rings (W)");
  rings.add(pathTuning, "showEnemyRings").name("selected enemy's rings");
  rings.add(pathTuning, "rangeRingOpacity", 0, 1, 0.05).name("ring opacity");
  rings.add(pathTuning, "rangeRingAimOpacity", 0, 1, 0.05).name("torpedo ring while aiming");
  rings.add(pathTuning, "rangeRingWidthPx", 0.5, 5, 0.1).name("ring width (px)");
  rings.add(pathTuning, "rangeRingDash", 0.005, 0.2, 0.005).name("railgun ring dash");
  rings.add(pathTuning, "rangeRingLabelMin", 0, 0.5, 0.005).name("label when bigger than");
  rings.close();

  const ai = gui.addFolder("AI captain");
  ai.add(aiTuning, "thinkS", 0.25, 5, 0.25).name("think every (s)");
  ai.add(aiTuning, "replanS", 10, 300, 5).name("replan route (s)");
  ai.add(aiTuning, "holdRangeFarM", 200000, 10000000, 50000).name("hold range, timid (m)");
  ai.add(aiTuning, "holdRangeNearM", 100000, 5000000, 50000).name("hold range, aggressive (m)");
  ai.add(aiTuning, "holdBandLow", 0.3, 1, 0.05).name("range band, low");
  ai.add(aiTuning, "holdBandHigh", 1, 2, 0.05).name("range band, high");
  ai.add(aiTuning, "launchRangeM", 500000, 10000000, 100000).name("torpedo range (m)");
  ai.add(aiTuning, "railgunRangeM", 50000, 2000000, 10000).name("railgun range (m)");
  ai.add(aiTuning, "salvoSizeMin", 1, 6, 1).name("salvo size, timid");
  ai.add(aiTuning, "salvoSizeMax", 1, 12, 1).name("salvo size, aggressive");
  ai.add(aiTuning, "salvoGapSlowS", 20, 400, 5).name("salvo gap, timid (s)");
  ai.add(aiTuning, "salvoGapFastS", 20, 400, 5).name("salvo gap, aggressive (s)");
  ai.add(aiTuning, "coldMinClosing", 0, 10000, 100).name("cold launch closing (m/s)");
  ai.add(aiTuning, "stationScore", 0, 1, 0.01).name("score: hold range");
  ai.add(aiTuning, "orientScore", 0, 1, 0.01).name("score: bring gun to bear");
  ai.add(aiTuning, "switchMargin", 0, 0.5, 0.01).name("switch margin");
  ai.add(aiTuning, "retreatHullBase", 0, 1, 0.01).name("retreat hull, base");
  ai.add(aiTuning, "retreatHullAggression", 0, 1, 0.01).name("retreat hull, aggression");
  ai.add(aiTuning, "retreatHullCaution", 0, 1, 0.01).name("retreat hull, caution");
  ai.add(aiTuning, "retreatFadeHull", 0.01, 0.5, 0.01).name("retreat fade-in (hull)");
  ai.add(aiTuning, "dryRetreatScore", 0, 1, 0.01).name("score: retreat when dry");
  ai.add(aiTuning, "evadeWindowS", 10, 400, 5).name("evade window (s)");
  ai.add(aiTuning, "evadeBase", 0, 1, 0.01).name("evade, base");
  ai.add(aiTuning, "coverFloor", 0, 1, 0.01).name("cover, base");
  ai.add(aiTuning, "coverIdleExposure", 0, 1, 0.05).name("cover, idle exposure");
  ai.add(aiTuning, "coverMaxTravelM", 100000, 10000000, 100000).name("cover travel limit (m)");
  ai.add(aiTuning, "coverMarginM", 1000, 500000, 1000).name("cover margin (m)");
  ai.add(aiTuning, "retreatDistanceM", 1000000, 100000000, 1000000).name("retreat distance (m)");
  ai.add(aiTuning, "retreatStrainLimit", 0.1, 1, 0.05).name("retreat strain limit");
  ai.add(aiTuning, "escapeRangeM", 1000000, 100000000, 1000000).name("escape range (m)");
  ai.close();

  const pdc = gui.addFolder("PDCs");
  pdc.add(pdcTuning, "killRatePerS", 0, 5, 0.05).name("kill rate (/s)");
  pdc.add(pdcTuning, "effectiveRange", 1000, 50000, 500).name("effective range (m)");
  pdc.add(pdcTuning, "maxRange", 5000, 200000, 1000).name("max range (m)");
  pdc.add(pdcTuning, "switchS", 0, 2, 0.05).name("switch time (s)");
  pdc.add(pdcTuning, "roundsPerMount", 100, 20000, 100).name("rounds per mount");
  pdc.add(pdcTuning, "roundsPerS", 5, 200, 5).name("rate of fire (/s)");
  pdc.add(pdcTuning, "shipHitsPerS", 0, 5, 0.05).name("hits on ships (/s)");
  pdc.add(pdcTuning, "curtainRadius", 100, 20000, 100).name("barrage radius (m)");
  pdc.add(pdcTuning, "autoEngagesShips").name("auto fires at ships");
  pdc.add(pathTuning, "pdcRoundSpeed", 500, 30000, 500).name("tracer speed (m/s)");
  pdc.add(pathTuning, "pdcRoundsDrawnPerS", 1, 60, 1).name("tracers drawn (/s)");
  pdc.add(pathTuning, "pdcStreakS", 0.01, 0.5, 0.01).name("tracer streak (s)");
  pdc.add(pathTuning, "pdcLineOpacity", 0, 1, 0.05).name("fire line opacity");
  pdc.add(pathTuning, "pdcDomeOpacity", 0, 0.05, 0.001).name("dome opacity");
  pdc.close();

  const hit = gui.addFolder("Impact effects");
  hit.add(impactTuning, "enabled").name("explosions and sparks");
  hit.add(impactTuning, "showHitText").name("hit text");
  hit.add(impactTuning, "hitTextOnOwn").name("hit text on our ships");
  hit.add(impactTuning, "bloomMinPx", 10, 300, 1).name("explosion min size (px)");
  hit.add(impactTuning, "bloomMaxPx", 50, 600, 5).name("explosion max size (px)");
  hit.add(impactTuning, "bloomRadiusM", 10, 5000, 10).name("explosion radius (m)");
  hit.add(impactTuning, "bloomDurationS", 0.2, 5, 0.05).name("explosion time (s)");
  hit.add(impactTuning, "bloomShipKillScale", 1, 6, 0.1).name("ship kill size (x)");
  hit.add(impactTuning, "bloomCoreHeat", 0, 1, 0.05).name("white-hot core");
  hit.add(impactTuning, "bloomRingOpacity", 0, 1, 0.05).name("shock ring");
  hit.add(impactTuning, "sparkCount", 3, 60, 1).name("sparks per burst");
  hit.add(impactTuning, "sparkSpeedPx", 20, 600, 5).name("spark speed (px/s)");
  hit.add(impactTuning, "sparkLengthPx", 3, 60, 1).name("spark length (px)");
  hit.add(impactTuning, "sparkDurationS", 0.1, 3, 0.05).name("spark time (s)");
  hit.add(impactTuning.sparkScale, "pdcKill", 0.1, 3, 0.05).name("PDC kill burst (x)");
  hit.add(impactTuning.sparkScale, "pdcHit", 0.1, 3, 0.05).name("PDC hit burst (x)");
  hit.add(impactTuning.sparkScale, "slugHit", 0.1, 3, 0.05).name("slug hit burst (x)");
  hit.add(impactTuning, "textRisePx", 0, 120, 1).name("hit text rise (px)");
  hit.add(impactTuning, "textDurationS", 0.3, 8, 0.1).name("hit text time (s)");
  hit.add(impactTuning, "textMergeS", 0, 2, 0.05).name("hit text merge (s)");
  hit.add(impactTuning, "maxBlooms", 1, 100, 1).name("most explosions at once");
  hit.add(impactTuning, "maxSparks", 20, 2000, 10).name("most sparks at once");
  hit.add(impactTuning, "maxTexts", 1, 40, 1).name("most hit texts at once");
  hit.close();

  const crew = gui.addFolder("G-strain");
  crew.add(crewTuning, "strainFillS", 30, 3600, 10).name("fill time at 2x cruise (s)");
  crew.add(crewTuning, "strainRecoverS", 30, 3600, 10).name("drain time (s)");
  crew.add(crewTuning, "efficiencyAtFullStrain", 0.1, 1, 0.05).name("efficiency at full strain");
  crew.add(crewTuning, "efficiencyAtNoCrew", 0.1, 1, 0.05).name("efficiency with no crew");
  crew.add(crewTuning, "casualtyIntervalS", 1, 60, 1).name("casualties every (s)");
  crew.add(crewTuning, "casualtyDamage", 0, 0.5, 0.01).name("casualty damage");
  crew.add(crewTuning, "strainWarn", 0, 1, 0.05).name("warn above");
  crew.close();

  const rg = gui.addFolder("Railguns");
  for (const kind of ["light", "spinal"] as const) {
    rg.add(railgunTuning[kind], "slugSpeed", 2000, 60000, 500).name(`${kind}: slug speed (m/s)`);
    rg.add(railgunTuning[kind], "rechargeS", 1, 120, 1).name(`${kind}: recharge (s)`);
    rg.add(railgunTuning[kind], "ammo", 1, 200, 1).name(`${kind}: slugs`);
    rg.add(railgunTuning[kind], "arcDeg", 0.5, 180, 0.5).name(`${kind}: arc (deg)`);
    rg.add(railgunTuning[kind], "damageScale", 0.1, 5, 0.1).name(`${kind}: damage (x)`);
    rg.add(railgunTuning[kind], "effectiveRange", 10000, 5000000, 10000).name(`${kind}: range ring (m)`);
  }
  rg.add(railgunTuning, "pdcSlugFactor", 0, 1, 0.05).name("PDC vs slug (x torpedo)");
  rg.add(railgunTuning, "dangerRadius", 100, 50000, 100).name("incoming if within (m)");
  rg.close();

  // Copies all current values as JSON, to paste back into the src/data files.
  gui.add(
    {
      copyValues: () => {
        const json = JSON.stringify(tuningRoots, null, 2);
        void navigator.clipboard.writeText(json);
      },
    },
    "copyValues",
  ).name("copy values");

  decoratePanel(gui);
  applyPanelStyle(gui);

  window.addEventListener("keydown", (e) => {
    if (e.key === "`") gui.show(gui._hidden);
  });

  return gui;
}
