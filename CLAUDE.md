# Project Ares

Browser-based 3D space combat game. The player commands one ship, then an attack group, then a fleet. Combat is shown on a holographic tactical table: every object is a symbol, nothing is a detailed model. Newtonian physics with a nav computer, real-time with pause, full sensor stealth.

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
- `npm run shot`: headless screenshot of the current scene to `shots/latest.png` (options: `-- --wait 1500 --width 1600 --height 900`)

Debug panel (lil-gui): press `` ` `` in the game. "copy values" puts all tunables on the clipboard as JSON.

Table controls: drag to rotate, right-drag or Shift-drag to pan, scroll to zoom, click to select, double-click or `F` to focus the selection, `T` toggles top-down, `Esc` clears the selection or cancels an order.

Orders (to the active ship, the last own ship selected): `B` burn to point, `I` intercept (rendezvous), `P` fast pass, `M` match velocity, `K` station-keep, `O` orient, `C` coast; `1`/`2`/`3` Cruise/Combat/Max G. Placing a point: press on the plane, drag up/down for height, release. Time: `Space` pause, `[` and `]` compression.

Scenarios: `?scenario=flight-test` (default) or `?scenario=holotable-test`, or the picker in the debug panel. In dev builds `window.__ares` exposes `{ game, view }` for inspection.

Screenshot URL options (pass with `npm run shot -- --query "..."`): `scenario=<name>`, `paused=1`, `focus=<id>`, `yaw=`, `pitch=`, `dist=` (meters), `top=1`, and effect overrides like `fx.bloomStrength=0`.

## Hard rules

1. Simulation and rendering are separate. `src/sim` never imports three.js or React and never touches the DOM. It must run headless in Node.
2. The sim runs on a fixed timestep (20 Hz). Rendering interpolates between sim states.
3. Determinism: no `Math.random`, `Date.now`, or `performance.now` inside `src/sim`. Use the seeded RNG in `src/sim/rng.ts`.
4. SI units in the sim: meters, seconds, kilograms, m/s². Convert to km, g, and mm:ss only for display.
5. Every player and AI action is a `Command` submitted to the sim. Nothing outside the sim mutates sim state.
6. The renderer and HUD read the player's sensor picture, never ground truth. Ground truth is visible only through the debug "God view" toggle.
7. Colors come from tokens in `src/render/palette.ts`. Red means hostile or danger and is never decorative. Amber means uncertain or warning.
8. Tunable numbers live in `src/data`, not in logic files. Expose new tunables in the lil-gui debug panel.
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
