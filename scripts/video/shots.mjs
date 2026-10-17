// The launch video's shot list, in order. Each clip opens one scene and records `seconds` of it.
// Every function here runs inside the game page (Playwright serializes it), so it can only use
// its argument and `window.__ares` (dev builds: { game, view }). Orders go through game.issue,
// the same Command path the player's keys use.
//   query    page address options (scenario or skirmish, camera, focus)
//   setup    runs once after the scene loads (or variants: setups tried in turn until accept()
//            is true after the warm-up)
//   warmup   unrecorded play before the clip: [{ run?, s?, until?, maxS?, each? }] (until: stop
//            once true; each: runs every 0.1 s, e.g. to hold time compression, which the game
//            drops to 1x by itself on a launch or a new contact)
//   events   [{ at: seconds into the clip, run, arg? }]
//   lead     { simS }: once a take is accepted, replay it and record from simS
//            before the moment it reached (the last seconds of a fight)
//   perFrame runs before every frame with { t, seconds } (camera moves)
//   caption / sub, captionAt / captionOut: the text and when it fades in and out

export const clips = [
  {
    name: "01-table",
    seconds: 5,
    query: "skirmish=open-duel&enemies=1&ai=hunter&focus=blue-ff1",
    setup: () => {
      const { game } = window.__ares;
      game.issue({ type: "burnTo", ship: "blue-ff1", point: { x: 2600e3, y: 1500e3, z: 300e3 }, g: "combat" });
    },
    warmup: [{ s: 1 }],
    perFrame: ({ t }) => window.__ares.view.cam.setView({ yawDeg: -55 + 7 * t, pitchDeg: 30 - 1.5 * t, distance: 7.5e6 - 0.35e6 * t }, false),
    caption: "Hard sci-fi space combat",
    sub: "INSPIRED BY THE EXPANSE",
  },
  {
    name: "02-burn",
    seconds: 6,
    query: "skirmish=open-duel&enemies=1&ai=hunter&focus=blue-ff1",
    setup: () => {
      const { game } = window.__ares;
      game.issue({ type: "burnTo", ship: "blue-ff1", point: { x: 2600e3, y: -1800e3, z: 200e3 }, g: "max" });
      game.setCompression(3);
    },
    warmup: [{ s: 2 }],
    perFrame: ({ t }) => window.__ares.view.cam.setView({ yawDeg: 20 - 4 * t, pitchDeg: 38, distance: 4.5e6 }, false),
    caption: "Newtonian flight",
    sub: "PLOT THE BURN · FLIP · BRAKE",
  },
  {
    name: "03-sensors",
    seconds: 7,
    query: "skirmish=moon-shadow&enemies=1&ai=skulker&focus=blue-ff1",
    setup: () => {
      window.__ares.game.setCompression(3);
    },
    warmup: [{ s: 3 }],
    events: [
      { at: 2.5, run: () => window.__ares.game.issue({ type: "setSensors", ship: "blue-ff1", on: true }) },
    ],
    perFrame: ({ t }) => window.__ares.view.cam.setView({ yawDeg: -30 + 5 * t, pitchDeg: 42, distance: 5.5e6 }, false),
    caption: "You only see what your sensors see",
    sub: "THRUST MAKES YOU VISIBLE · GO DARK · HIDE BEHIND THE MOON",
  },
  {
    name: "04-pdc",
    seconds: 9,
    query: "scenario=pdc-test&focus=blue-ff1",
    // Fast-forward to the first salvo (launched at 10 s, about 100 km out at 146 s), then
    // play it at 1x: the PDCs open up at about 152 s.
    warmup: [
      { until: () => window.__ares.game.simTime >= 146, each: () => window.__ares.game.setCompression(3), maxS: 60 },
      { run: () => window.__ares.game.setCompression(0) },
    ],
    perFrame: ({ t }) => window.__ares.view.cam.setView({ yawDeg: 35 + 3 * t, pitchDeg: 26, distance: 120e3 - 8e3 * t }, false),
    caption: "Six torpedoes inbound",
    sub: "POINT DEFENSE IS YOUR LAST LINE",
  },
  {
    name: "05-railgun",
    seconds: 6,
    query: "skirmish=knife-fight&enemies=1&ai=duelist&focus=blue-ff1",
    setup: () => {
      const { game } = window.__ares;
      game.issue({ type: "orient", ship: "blue-ff1", target: { kind: "track", id: "red-ff1" } });
    },
    warmup: [{ s: 4 }],
    events: [
      { at: 0.6, run: () => window.__ares.game.issue({ type: "fireRailgun", ship: "blue-ff1", target: { kind: "track", id: "red-ff1" } }) },
      { at: 2.4, run: () => window.__ares.game.issue({ type: "launchTorpedoes", ship: "blue-ff1", target: { kind: "track", id: "red-ff1" }, count: 4, mode: "hot" }) },
    ],
    perFrame: ({ t }) => window.__ares.view.cam.setView({ yawDeg: -15 + 4 * t, pitchDeg: 26, distance: 210e3 }, false),
    caption: "Railguns at knife-fight range",
  },
  {
    name: "06-victory",
    seconds: 6,
    query: "skirmish=knife-fight&enemies=1&ai=duelist&focus=blue-ff1",
    // Fight it out off camera; record the moment it ends (the blast and the banner). Takes
    // that do not end in VICTORY are thrown away and the next tactic is tried.
    variants: [
      () => {
        const { game } = window.__ares;
        const tgt = { kind: "track", id: "red-ff1" };
        game.issue({ type: "launchTorpedoes", ship: "blue-ff1", target: tgt, count: 6, mode: "hot" });
        game.issue({ type: "intercept", ship: "blue-ff1", target: tgt, mode: "fastPass", g: "max" });
      },
      () => {
        const { game } = window.__ares;
        const tgt = { kind: "track", id: "red-ff1" };
        game.issue({ type: "launchTorpedoes", ship: "blue-ff1", target: tgt, count: 6, mode: "hot" });
        game.issue({ type: "intercept", ship: "blue-ff1", target: tgt, mode: "fastPass", g: "combat" });
      },
      () => {
        const { game } = window.__ares;
        const tgt = { kind: "track", id: "red-ff1" };
        game.issue({ type: "launchTorpedoes", ship: "blue-ff1", target: tgt, count: 4, mode: "hot" });
        game.issue({ type: "burnTo", ship: "blue-ff1", point: { x: -200e3, y: 0, z: 0 }, g: "combat" });
      },
      () => {
        const { game } = window.__ares;
        const tgt = { kind: "track", id: "red-ff1" };
        game.issue({ type: "launchTorpedoes", ship: "blue-ff1", target: tgt, count: 12, mode: "hot" });
        game.issue({ type: "orient", ship: "blue-ff1", target: tgt });
      },
    ],
    warmup: [
      {
        until: () => window.__ares.game.outcome !== null,
        // 16x, and the railgun whenever it is likely to be charged.
        each: () => {
          const { game } = window.__ares;
          game.setCompression(2);
          const alive = (id) => game.world.ships.some((s) => s.id === id);
          if (Math.floor(game.simTime) % 6 === 0 && alive("blue-ff1") && alive("red-ff1"))
            game.issue({ type: "fireRailgun", ship: "blue-ff1", target: { kind: "track", id: "red-ff1" } });
        },
        maxS: 120,
      },
    ],
    accept: () => window.__ares.game.outcome?.title === "VICTORY",
    // Record from 45 sim seconds before the end (at 16x, about 3 s of the kill), then the banner.
    lead: { simS: 45 },
    perFrame: ({ t }) => window.__ares.view.cam.setView({ yawDeg: 10 + 3 * t, pitchDeg: 30, distance: 240e3 }, false),
  },
  {
    name: "07-endcard",
    seconds: 7.5,
    page: "endcard",
    perFrame: ({ t }) => window.card(t),
  },
];

export const totalSeconds = clips.reduce((sum, c) => sum + c.seconds, 0);
