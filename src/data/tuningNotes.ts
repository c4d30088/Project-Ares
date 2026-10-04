// One-line explanations for the debug panel, shown under each control and searched by the
// search box. Keys are "<tuning object>.<property>" (nested: "railgunTuning.light.ammo").
// Every control in the panel needs one; tests/debugPanel.test.ts fails if one is missing.
// Plain language: what it changes in the game, and what happens if you raise it.

const railgunBoth = (prop: string, text: (kind: string) => string): Record<string, string> => ({
  [`railgunTuning.light.${prop}`]: text("light turret"),
  [`railgunTuning.spinal.${prop}`]: text("spinal gun"),
});

export const tuningNotes: Record<string, string> = {
  // --- The panel itself ---
  "panel.scenario": "Which scenario is loaded. Picking another one reloads the game.",
  "panel.restart": "Starts the current scenario again from the beginning. Your tuning values are kept.",
  "panel.showNotes": "Shows or hides these explanation lines under each control (the search still reads them).",
  "panel.textPx": "Size of the control names and values in this panel. Rows grow with it. Remembered when the page reloads.",
  "panel.notePx": "Size of the grey explanation line under each control (like this one). Remembered when the page reloads.",
  "panel.widthPx": "How wide this panel is. Wider gives the sliders more room at large text sizes.",
  "panel.font": "Typeface for the panel: its own sans, the game's HUD font, or the HUD's monospace.",
  "panel.resetLook": "Puts the panel's text size, explanation size, width and font back to their defaults.",
  "panel.copyValues": "Copies every tuning value as JSON to the clipboard. Paste it into the chat to save your tweaks as the new defaults.",

  // --- Physics and time ---
  "physicsTuning.gravityEnabled": "Moons, planets and asteroids pull on ships and torpedoes. Off: no gravity (bodies are still solid).",
  "timeTuning.slowOnFlip": "Drops time to 1x when one of your ships starts its flip to brake, so you can watch it.",
  "timeTuning.slowOnOrderComplete": "Drops time to 1x when one of your ships finishes an order (arrives, matches speed, and so on).",
  "timeTuning.maxSimMsPerFrame": "If the simulation takes longer than this many milliseconds per screen frame, time compression steps down by itself to keep the game smooth.",

  // --- Nav computer ---
  "navTuning.alignToleranceDeg": "How closely the nose must point at the wanted direction before the main drive fires. Smaller: ships wait to line up, then burn straighter.",
  "navTuning.arriveDistance": "A Burn To order counts as finished inside this distance (m) of the point, once the ship is also slow enough.",
  "navTuning.arriveSpeed": "...and below this speed (m/s). Raise it for sloppier, faster arrivals.",
  "navTuning.lateralTimeConstant": "How quickly sideways drift is cancelled. Bigger values correct more gently.",
  "navTuning.lateralShare": "While accelerating, sideways corrections may use at most this fraction of the thrust.",
  "navTuning.rendezvousStandoff": "An Intercept order stops this far short of the target (m), alongside it.",
  "navTuning.stationHoldRadius": "Station-keeping lets the ship drift this far (m) before it burns to get back.",
  "navTuning.noReturnMargin": "Gravity safety factor for the no-go zone around bodies. Higher keeps ships farther from heavy bodies.",
  "navTuning.bodyHardMarginMeters": "Extra clearance (m) added above a body's surface in its keep-out limit.",
  "navTuning.hoverMinAccel": "A holding ship only burns to hover against gravity when the pull is stronger than this (m/s²).",
  "navTuning.asteroidHardMarginFraction": "How far beyond its surface an asteroid keeps ships out, as a fraction of its radius (asteroids are lumpy).",
  "navTuning.roundBodyHardMarginFraction": "The same for moons and planets, which are nearly round.",
  "navTuning.routeClearanceFactor": "Routes around a body pass at this multiple of its no-go radius. 1.02 leaves a little margin.",
  "navTuning.avoidMarginMeters": "Extra margin (m) at which the last-resort swerve takes over if a ship's motion would carry it into a body.",

  // --- Ship routes (the predicted path lines) ---
  "pathTuning.burnWidthPx": "Thickness of a ship's predicted route where it is burning (px).",
  "pathTuning.burnOpacity": "Brightness of the burning part of a route.",
  "pathTuning.coastWidthPx": "Thickness of a ship's predicted route where it is coasting (px).",
  "pathTuning.coastOpacity": "Brightness of the coasting (dashed) part of a route.",
  "pathTuning.dashScale": "Length of the dashes on coasting routes, as a fraction of how far away the camera is.",

  // --- Camera ---
  "cameraTuning.fovDeg": "Camera field of view in degrees. Wider shows more of the table but bends perspective.",
  "cameraTuning.rotateSpeed": "Degrees the camera turns per pixel you drag.",
  "cameraTuning.zoomSpeed": "How much one scroll step zooms. Higher is faster.",
  "cameraTuning.dampingFactor": "How smoothly the camera glides to a stop. Lower is smoother and slower to settle; 1 is instant.",

  // --- Holotable ---
  "holotableTuning.gridDensity": "Higher gives a finer reference grid at the same zoom.",
  "holotableTuning.boxScale": "Half-width of the table's bounding box, as a fraction of how far away the camera is.",
  "holotableTuning.boxHeightRatio": "How tall the bounding box is compared with its width.",
  "holotableTuning.gridOpacity": "Brightness of the reference grid on the plane.",
  "holotableTuning.ringOpacity": "Brightness of the distance rings.",
  "holotableTuning.axisOpacity": "Brightness of the X, Y and Z axis lines.",
  "holotableTuning.boxOpacity": "Brightness of the bounding box edges.",
  "holotableTuning.edgeFade": "How much of the grid's width fades out toward the box edge. 0 is no fade, 1 fades from the center.",
  "holotableTuning.ringCount": "About how many distance rings fit inside the box (the real count rounds to 1-2-5 distances).",
  "holotableTuning.dropLineOpacity": "Brightness of the lines dropped from ships to the plane (dashed below the plane). They show height.",
  "holotableTuning.torpedoDropLineOpacity": "The same, for torpedoes. Kept faint so a swarm does not turn into a forest of lines.",
  "holotableTuning.bodyDropLineOpacity": "The same, for moons and asteroids.",
  "holotableTuning.footRingPx": "Radius of the little ring where a drop line meets the plane (px).",
  "holotableTuning.dashScale": "Length of the dashes on drop lines below the plane, as a fraction of camera distance.",

  // --- Symbols ---
  "symbolTuning.scale": "Multiplier on the size of every ship and torpedo symbol.",
  "symbolTuning.size.corvette": "On-screen size of corvette symbols (px).",
  "symbolTuning.size.frigate": "On-screen size of frigate symbols (px).",
  "symbolTuning.size.destroyer": "On-screen size of destroyer symbols (px).",
  "symbolTuning.size.cruiser": "On-screen size of cruiser symbols (px).",
  "symbolTuning.size.capital": "On-screen size of capital ship symbols (px).",
  "symbolTuning.size.station": "On-screen size of station symbols (px).",
  "symbolTuning.size.unknown": "On-screen size of unidentified contact symbols (px).",
  "symbolTuning.size.torpedo": "On-screen size of torpedo symbols (px).",
  "symbolTuning.torpedoPulseHz": "How fast enemy torpedoes pulse, in flashes per second.",
  "symbolTuning.pulseMin": "How dim an enemy torpedo gets at the bottom of its pulse. 1 means no pulse at all.",
  "symbolTuning.bodyOpacity": "Brightness of the marker drawn for bodies too small to see as spheres.",
  "symbolTuning.labelOpacity": "Brightness of the name labels next to ships.",

  // --- Bodies ---
  "bodyTuning.contourCount": "How many topographic contour lines are drawn across a moon or asteroid.",
  "bodyTuning.contourOpacity": "Brightness of the contour lines.",
  "bodyTuning.rimOpacity": "Brightness of the glowing edge around a body.",
  "bodyTuning.moonRoughness": "How bumpy moons look (surface relief as a fraction of radius).",
  "bodyTuning.asteroidRoughness": "How bumpy asteroids look.",
  "bodyTuning.noiseFrequency": "Size of the bumps. Higher gives smaller, finer bumps.",

  // --- Effects (screen look) ---
  "effectsTuning.enabled": "Master switch for the glow and the color split. Off is the plainest, sharpest picture.",
  "effectsTuning.bloomStrength": "How strongly bright things glow.",
  "effectsTuning.bloomRadius": "How far the glow spreads.",
  "effectsTuning.bloomThreshold": "Only things brighter than this glow. Lower makes more of the picture glow.",
  "effectsTuning.chromaticPx": "A red/blue color split across the whole screen, in pixels. Gives the holographic fringe.",
  "effectsTuning.chromaticRadialPx": "Extra color split toward the screen edges (px at the corners).",
  "effectsTuning.dustOpacity": "Brightness of the faint floating dust that gives a sense of depth when you rotate.",

  // --- Torpedoes ---
  "torpedoTuning.accelG": "How hard torpedoes accelerate, in g.",
  "torpedoTuning.deltaV": "A torpedo's total fuel budget, as speed it can add (m/s). More fuel: longer reach and harder maneuvers.",
  "torpedoTuning.terminalReserve": "Part of the fuel budget saved for last-moment homing corrections (m/s).",
  "torpedoTuning.terminalPhaseS": "Final homing begins this many seconds before impact.",
  "torpedoTuning.fuseRadius": "A torpedo detonates when it passes within this distance (m) of an enemy ship.",
  "torpedoTuning.seekerRange": "How far a torpedo's seeker can find a target when aimed at a point or after losing its target (m).",
  "torpedoTuning.pointArrival": "A torpedo sent to a point switches on its seeker this far from the point (m).",
  "torpedoTuning.mineLifetimeS": "A torpedo that finds nothing waits as a mine this long (s), then self-destructs.",
  "torpedoTuning.coldEjectSpeed": "Speed a cold-launched torpedo is pushed out at (m/s). It coasts quietly until its drive lights.",
  "torpedoTuning.coldIgnitionDistance": "A cold-launched torpedo lights its drive this far from its target (m).",
  "torpedoTuning.hotEjectSpeed": "Sideways push-out speed of a hot launch (m/s), to clear the tubes.",
  "torpedoTuning.tubeReloadS": "Seconds a tube takes to reload after firing. Bigger salvos leave in waves this far apart.",
  "torpedoTuning.salvoHold": "A salvo bigger than the tubes waits beside the ship until the last torpedo is out, then all light together and arrive as one wave.",
  "torpedoTuning.effectiveRange": "Radius of the range ring shown while aiming torpedoes (m). Display only; it does not limit them.",
  "pathTuning.rangeRingOpacity": "Brightness of the torpedo range ring.",
  "pathTuning.interceptWidthPx": "Thickness of a torpedo's dotted path line (px).",
  "pathTuning.interceptOpacity": "Brightness of torpedo path lines. Faint keeps a salvo reading as thin converging threads.",
  "pathTuning.interceptDotScale": "Size of the dots in torpedo path lines, as a fraction of camera distance.",

  // --- PDCs ---
  "pdcTuning.killRatePerS": "How fast a PDC's chance of killing a torpedo builds up (per second of fire inside effective range). Higher: fewer torpedoes get through.",
  "pdcTuning.effectiveRange": "Inside this range (m) a PDC is at full strength; the kill chance fades to nothing at max range.",
  "pdcTuning.maxRange": "The farthest a PDC can fire at all (m).",
  "pdcTuning.switchS": "Seconds a PDC takes to swing onto a new target. Damage makes it slower.",
  "pdcTuning.roundsPerMount": "Rounds in each PDC's magazine.",
  "pdcTuning.roundsPerS": "How many rounds a PDC fires per second. Faster burns ammo faster.",
  "pdcTuning.shipHitsPerS": "Against ships (Manual, or Auto if allowed): hits per second inside effective range.",
  "pdcTuning.curtainRadius": "A barrage at a point engages any torpedo passing within this distance of it (m).",
  "pdcTuning.autoEngagesShips": "Lets PDCs on Auto also fire at enemy ships inside effective range, not just torpedoes and slugs.",
  "pathTuning.pdcRoundSpeed": "How fast the drawn tracer rounds fly (m/s). Display only; the sim decides kills.",
  "pathTuning.pdcRoundsDrawnPerS": "How many tracer rounds are drawn per gun per second. Display only.",
  "pathTuning.pdcStreakS": "Length of each tracer streak, in seconds of its flight. Longer looks like lasers.",
  "pathTuning.pdcLineOpacity": "Brightness of the faint line from a firing gun to its target.",
  "pathTuning.pdcDomeOpacity": "Brightness of the PDC coverage domes when the gun is idle.",

  // --- Impact effects ---
  "impactTuning.enabled": "Master switch for explosions and sparks. Hit text is separate.",
  "impactTuning.showHitText": "Floating text above a struck ship, such as HULL -35%.",
  "impactTuning.hitTextOnOwn": "Also show the hit text above your own ships. Off: only above enemy ships.",
  "impactTuning.bloomMinPx": "Smallest size (px across) of a torpedo explosion at normal table zoom.",
  "impactTuning.bloomMaxPx": "Largest size of an explosion when you are zoomed in close.",
  "impactTuning.bloomRadiusM": "Stylized blast radius in meters. It sets how big explosions grow as you zoom in.",
  "impactTuning.bloomDurationS": "How long an explosion lasts (real seconds).",
  "impactTuning.bloomShipKillScale": "A destroyed ship's explosion is this many times bigger than a torpedo hit.",
  "impactTuning.bloomCoreHeat": "How white the hot center of an explosion is. 0 is all color, 1 a bright white core.",
  "impactTuning.bloomRingOpacity": "Brightness of the shock ring that expands from an explosion.",
  "impactTuning.sparkCount": "Sparks in a burst at normal size.",
  "impactTuning.sparkSpeedPx": "How fast sparks fly outward (px per second). They slow as they go.",
  "impactTuning.sparkLengthPx": "Length of each spark streak (px).",
  "impactTuning.sparkDurationS": "How long sparks last (real seconds).",
  "impactTuning.sparkScale.pdcKill": "Size of the spark burst when a PDC shoots down a torpedo (1 = normal).",
  "impactTuning.sparkScale.pdcHit": "Size of the spark burst when PDC fire strikes a ship.",
  "impactTuning.sparkScale.slugHit": "Size of the spark burst when a railgun slug strikes a ship.",
  "impactTuning.textRisePx": "How far hit text floats upward before it fades (px).",
  "impactTuning.textDurationS": "How long hit text stays on screen (real seconds).",
  "impactTuning.textMergeS": "Hits on the same ship within this many seconds add into one label, so PDC fire is not a stream of tiny numbers.",
  "impactTuning.maxBlooms": "Most explosions drawn at once. A cap so huge exchanges at high time compression do not flood the screen.",
  "impactTuning.maxSparks": "Most sparks drawn at once.",
  "impactTuning.maxTexts": "Most hit-text labels on screen at once.",

  // --- G-strain ---
  "crewTuning.strainFillS": "Seconds for strain to fill from nothing at twice Cruise G. Shorter makes high-G burns costlier.",
  "crewTuning.strainRecoverS": "Seconds for strain to drain from full to nothing at or below Cruise G.",
  "crewTuning.efficiencyAtFullStrain": "How well the crew performs at full strain (1 is unaffected). Lower makes turns slower and PDC fire worse.",
  "crewTuning.efficiencyAtNoCrew": "How well the ship performs once its crew subsystem is destroyed.",
  "crewTuning.casualtyIntervalS": "At full strain above Cruise G, the crew takes casualties this often (seconds).",
  "crewTuning.casualtyDamage": "How much crew health each casualty event takes (1 = all of it).",
  "crewTuning.strainWarn": "G-strain above this fraction raises a warning in the alert strip and the log.",

  // --- Railguns ---
  ...railgunBoth("slugSpeed", (k) => `How fast the ${k}'s slug flies (m/s). Faster means shorter flight times and easier hits.`),
  ...railgunBoth("rechargeS", (k) => `Seconds the ${k} takes to recharge between shots.`),
  ...railgunBoth("ammo", (k) => `Slugs the ${k} carries.`),
  ...railgunBoth("arcDeg", (k) => `How far off the bow the ${k} can aim (degrees). A spinal gun fires along the keel, so the ship must point at the target.`),
  ...railgunBoth("damageScale", (k) => `Damage multiplier for the ${k}'s slugs.`),
  "railgunTuning.pdcSlugFactor": "PDC kill chance against a slug, as a fraction of the chance against a torpedo. Slugs are fast and small.",
  "railgunTuning.dangerRadius": "A predicted slug path passing within this distance (m) of one of your ships counts as incoming and raises the alert.",
};
