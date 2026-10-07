# Project Ares

> **This is a video game.** Project Ares is a fictional, single-player browser strategy game set in an invented far-future solar system. Every ship, weapon, sensor, faction, and number in this project is made-up game content, tuned for fun in playtesting. None of it describes or models real-world military equipment, and the code is ordinary game code: 3D rendering, game physics, UI, and AI opponents.

Browser-based 3D science-fiction strategy game (entertainment software). The player commands one ship, then an attack group, then a fleet. Combat is shown on a holographic tactical table: every object is a symbol, nothing is a detailed model. Newtonian physics with a nav computer, real-time with pause, full sensor stealth.

The project owner directs and playtests. They do not write code. Keep changes small, explain them in plain language, and always leave the game in a runnable state.

## Read first

- `docs/DESIGN.md`: what the game is, the mechanics, the visual language, starting numbers
- `docs/ARCHITECTURE.md`: tech stack, folder layout, core patterns
- `docs/ROADMAP.md`: milestones and playtest checkpoints. Work on the current milestone only.
- `docs/PLAYTEST_LOG.md`: the owner's notes from playing. Read the latest entry before starting work.

Reference images are in `UX reference/` and `The Expanse UI Reference/`. They are mood references for the look only. They are not in git.

## Commands

- `npm run dev`: start the game locally at http://localhost:5173
- `npm test`: run unit tests (includes `tests/simRules.test.ts`, which enforces hard rules 1 and 3 on `src/sim`)
- `npm run build`: type-check, then production build to `dist/`
- `npm run preview`: serve the production build from `dist/` at http://localhost:4173 (what Cloudflare Pages serves; see `docs/DEPLOY.md`)
- `npm run shot`: headless screenshot of the current scene to `shots/latest.png` (options: `-- --wait 1500 --width 1600 --height 900`)

Debug panel (lil-gui): press `` ` `` in the game. The search box at the top finds a control by name or by what it does; every control has a one-line explanation under it ("show explanations" hides them). "copy values" puts all tunables on the clipboard as JSON.

Table controls: drag to rotate, right-drag or Shift-drag to pan, scroll to zoom, click to select, double-click or `F` to focus the selection, `T` toggles top-down, `Esc` clears the selection or cancels an order.

Orders (to the active ship, the last own ship selected; these are the default keys, which the player can rebind in Settings, Controls; the map is `src/game/keymap.ts`): `B` burn to point, `I` intercept (rendezvous), `P` fast pass, `M` match velocity, `K` station-keep, `O` orient, `R` orbit (click a body), `C` coast, `E` evade (one slight bend in the current route; still arrives), `V` evasive maneuvers (corkscrew; cancels the route); `1`/`2`/`3` Cruise/Combat/Max G; `S` Sensors on/off; `W` shows or hides our weapon range rings (a selected enemy's rings show in red); `L` launch torpedoes (then click a ship or object, or place a point; salvo size and Hot/Cold are keys in the Torpedoes station); `G` fires the railgun (then click a ship, which is shot at its lead point shown while hovering, an object, or place a point); `D` assigns all PDCs to a target (Manual); the Point defense station sets Auto/Manual/Hold for all or, by clicking a mount key, for one, and holds burst fire for Auto and the rounds gauge. The bottom deck (M6, `src/ui/deck/`): Weapons control on the left (Torpedoes, Railgun, Point defense stations), Time in the middle, Helm on the right (order tiles whose status line lights while the order runs, thrust tabs, Sensors). Weapons and Helm share one height (`--deck-h` in `deck.css`); `deck/fit.ts` centers the three as a group, scales them on narrower windows, lifts the Time panel above the row when it no longer fits, and lets the side rails run to the bottom when the deck fits between them. UI scale (`src/ui/uiScale.ts`): Cmd/Ctrl + and − (Cmd/Ctrl 0 resets) or the Settings slider zoom the HUD only, not the table. Placing a point: press on the plane, drag up/down for height, release. Time: `Space` pause, `[` and `]` compression (or click a mark on the Time ruler). `N` turns sound on or off (also SND in the Time panel's band; volumes are in the debug panel's Sound folder, which can also play any sound on demand).

Settings (M6, `src/ui/SettingsScreen.tsx`, saved in the browser by `src/game/settings.ts`): SET in the Time panel's band or Settings on the setup screen; color palette, Reduce effects, volume, sound on or off, and Controls (rebind any shortcut; a key already in use swaps; Esc, ` and Enter are fixed). The game pauses while it is open.

Opening the bare address (http://localhost:5173/) shows the skirmish setup screen: pick a map, 1v1 or 1v2, and an AI personality (Hunter, Duelist, Skulker), then Start (or Enter). It reloads with `?skirmish=<map>&enemies=<1|2>&ai=<name>` (maps: `open-duel`, `pincer`, `moon-shadow`, `rock-garden`, `knife-fight`, defined in `src/data/skirmish.ts`), so a skirmish can be linked to. The result banner (VICTORY, DEFEAT, DRAW) has Replay, Restart and Back to setup. Replay (M6) re-runs the fight with a timeline (click or drag to jump), speed, and Our view / Their view / All; Esc or Exit replay goes back to the result.

Scenarios (the setup screen lists them too, and a `?scenario=` link skips the setup screen): `?scenario=flight-test` (what `npm run shot` shows when it has no `--query`), `?scenario=first-fight` (two scripted enemy frigates; the M3 checkpoint fight), `?scenario=holotable-test` or `?scenario=pdc-test` (enemy cruiser and destroyer fire timed salvos at you), or the picker in the debug panel; "restart scenario" in the debug panel starts it again and keeps tuning. Scripted ships (`behavior: "skirmisher"`, `src/sim/ai/scripted.ts`) and AI captains (`behavior: "captain"` with a personality name or numbers, `src/sim/ai/captain.ts`) are listed under `ai` in a scenario. Scenario commands can take `atS` (seconds in) to happen later. Sensors (M4 Sensors Lite, `src/sim/sensors/`): scenarios play on sensors unless they say `"sensors": "perfect"` (holotable-test and pdc-test do); each side starts briefed on where every enemy ship was unless `"intel": "none"`; ships can start with `"sensorsOn": true`. Sim tests built with `makeWorld` (tests/helpers.ts) are perfect information unless the test sets `perfectInfo = false`. In dev builds `window.__ares` exposes `{ game, view }` for inspection.

Screenshot URL options (pass with `npm run shot -- --query "..."`): `scenario=<name>`, `paused=1`, `focus=<id>`, `yaw=`, `pitch=`, `dist=` (meters), `top=1`, effect overrides like `fx.bloomStrength=0`, and `palette=redGreen` or `palette=blueYellow` (color-blind palettes; not saved).

## Hard rules

1. Simulation and rendering are separate. `src/sim` never imports three.js or React and never touches the DOM. It must run headless in Node.
2. The sim runs on a fixed timestep (20 Hz). Rendering interpolates between sim states.
3. Determinism: no `Math.random`, `Date.now`, or `performance.now` inside `src/sim`. Use the seeded RNG in `src/sim/rng.ts`.
4. SI units in the sim: meters, seconds, kilograms, m/s². Convert to km, g, and mm:ss only for display.
5. Every player and AI action is a `Command` submitted to the sim. Nothing outside the sim mutates sim state.
6. The renderer and HUD read the player's sensor picture, never ground truth. Ground truth is visible only through the debug "God view" toggle.
7. Colors come from tokens in `src/render/palette.ts` (three palettes with the same meanings: standard, red-green safe, blue-yellow safe; the player picks one in Settings). Red means hostile or danger and is never decorative. Uncertain or warning is orange on the 3D table and amber in the HUD panels. Weapons once fired (torpedoes in flight, PDC fire, slugs, impact effects) are green (ours) and yellow (the enemy's). Neutral is white.
8. Tunable numbers live in `src/data`, not in logic files. Expose new tunables in the lil-gui debug panel, with a one-line explanation in `src/data/tuningNotes.ts` (a test fails without it).
9. Large distances: camera-relative rendering (floating origin) and a logarithmic depth buffer. Never write raw positions near 1e8 m into float32 GPU buffers.
10. Every weapon accepts a `Target` that is a track, an object, or a point in space. Only PDCs have an automatic mode. Never add auto-fire to torpedoes or railguns.
11. Sensor data is built per ship and merged per datalink network. Every track records which ships contribute to it.
12. The setting is original. Do not use ship names, factions, places, technologies, or slang from existing franchises.

## Working style

- Before any change that touches more than two files, write a short plan and wait for approval.
- After each change: run tests, run the build, take a screenshot with `npm run shot` and look at it. Fix what you broke before reporting.
- Commit after every working step with a clear message. One feature per commit.
- When reporting back, tell the owner in one or two lines what to do in the game to see the change.
- Physics, guidance, and sensor code (autopilot, intercept, detection) needs unit tests.
- Do not add a dependency without saying what it is for.
- If a request conflicts with these rules or with `docs/DESIGN.md`, say so before building.
