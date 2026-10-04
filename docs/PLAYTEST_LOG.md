# Playtest Log

> **This is a video game.** Project Ares is a fictional, single-player browser strategy game set in an invented far-future solar system. Every ship, weapon, sensor, faction, and number in this project is made-up game content, tuned for fun in playtesting. None of it describes or models real-world military equipment, and the code is ordinary game code: 3D rendering, game physics, UI, and AI opponents.

Newest entry at the top. Claude Code reads the latest entry at the start of each session.

## Template

```
## YYYY-MM-DD, milestone MX
Played: (scenario, how many times)
Felt good:
Felt wrong: (what I saw vs. what I expected)
Confusing:
Next session: (the one thing to fix or try first)
```

---

## 2026-10-04, milestone M3: build complete, ready for the checkpoint playtest
Next session: start with the playtest. The owner plays the First fight 5 times and gives combat feedback; Claude Code writes the M3 playtest entry from it, then fixes or tunes what the owner reports. Do not start M4 until the checkpoint passes or the owner decides to move on.

How to play the checkpoint
- Run `npm run dev`, open http://localhost:5173/?scenario=first-fight (or pick "first-fight" in the debug panel, toggled with the backquote key). "restart scenario" at the top of the debug panel starts it again and keeps any tuning.
- The fight: your frigate FF-1 WARDEN at rest; two enemy frigates (TRK-21, TRK-22) about 7,500 km out, above the plane, closing from two directions; the moon ORRAN and three asteroids in between. The enemies close at Cruise G, hold about 2,500 km, fire 4 torpedoes each every 90 s timed to arrive together, and close in with railguns once their torpedoes are spent. The first salvo lands about 16 minutes in; speed up with `]`, time drops to 1x on launches, threats inside 60 s, hits and flips.
- Weapons: `L` torpedoes (then click a ship, object or place a point; salvo size and Hot/Cold in the bottom bar; range ring while aiming). `G` railgun (hover a ship to see its lead point and flight time, click to fire). `D` assigns every PDC to a target (click an incoming torpedo); the PDC row sets Auto / Manual / Hold for all, chips cycle one mount; burst fire for Auto is in the left rail.
- Movement: `B` burn, `I` intercept, `P` fast pass, `M` match velocity, `K` station-keep, `O` orient (bring guns and the railgun arc to bear), `R` orbit, `C` coast; `1`/`2`/`3` Cruise/Combat/Max G (G-strain builds above Cruise).
- The checkpoint (ROADMAP M3): use each target type at least once (a torpedo salvo at a ship, a railgun shot at a point where you expect an enemy, PDCs on Auto then Manual). At least once, the converging swarm should make you lean toward the screen. You should be able to say why each torpedo that hit you got through.

What to report (copy into the M3 entry above this one): played (how many fights, won or lost, how long), felt good, felt wrong (what you saw vs. what you expected), confusing, and the one thing to fix first. Useful specifics: was the incoming swarm tense; were your own salvos worth firing; did the railgun matter; was G-strain noticeable; could you read the table during the exchange; anything that felt unfair.

What M3 built (all committed on branch claude/m3-game-dev-c8b8a5; 171 tests)
- Torpedoes: hot and cold launch, tubes and magazine, salvo hold (a salvo bigger than the tubes lights together and arrives as one wave; owner decision), guidance that leads target acceleration, routes around bodies, a last-moment swerve, seeker, mines at a point, proximity fuse (never friendlies). Dotted intercept line along each torpedo's real predicted path, impact X with countdown and salvo count.
- PDCs: 4 mounts with arcs (faint domes), Auto / Manual / Hold, 0.3 s switch, 3,000 rounds each at 50/s, burst fire for Auto, tracer rounds, kill rolls on the seeded RNG. Starting kill rate 0.8/s: 4 guns stop small salvos; 12 torpedoes inside 3 s leak about one.
- Railgun: light turret (20 km/s, 75 degree arc, 8 s recharge, 40 slugs); spinal guns on cruisers and capital ships. Slugs cannot be tracked: each side sees the shot and its predicted path; enemy fire raises RAILGUN FIRE DETECTED and SLUG T-mm:ss. PDCs on Auto engage incoming slugs at 0.3 of their torpedo kill chance.
- G-strain and crew efficiency, ship status panel (left rail), alert strip (three most urgent alerts), scripted enemy (src/sim/ai/scripted.ts), First fight and PDC test scenarios, restart.
- Colors (owner decisions, in DESIGN.md and CLAUDE.md rule 7): weapon fire green for ours and yellow for theirs; neutral white; uncertain or warning orange on the table, amber in the HUD.
- Owner tuning saved this milestone: torpedo symbols 20, torpedo drop lines 0.1, intercept lines 0.1, tracer streaks 0.01 s, fire lines 0.05, route lines 3 px / 0.25 burning and 1 px / 0.1 coasting with longer dashes.

Headless tuning result (8 seeds, a stand-in player that holds position, fires salvos of 6 and uses the railgun up close, never maneuvers or touches the PDCs): with salvo hold it wins 3 of 8; 13 of 192 enemy torpedoes and 7 to 19 of 96 of ours get through. A real player who maneuvers, uses cover and manages the PDCs should do better; if not, the first knobs are enemy salvo size (scenario `ai` entries in src/data/scenarios/first-fight.json), PDC kill rate and torpedo numbers (debug panel).

Known limits and open items
- The enemy never evades and never uses cover; it is a fixed script, not the M5 AI captain.
- Sensors are perfect until M4: you always see everything, including ships hidden behind bodies. Line-of-sight targeting (hidden ships hard to hit) is planned in M4 (owner request, recorded in the roadmap).
- No win or loss screen yet (M5); the alert strip says ALL TARGETS DESTROYED or ALL OUR SHIPS LOST.
- A torpedo aimed at a target tucked close behind a big moon may run out of fuel going around (it never hits the moon).
- While a held salvo waits for its last torpedo, the early torpedoes' predicted paths are a little off for a few seconds.
- Orbit rings use the coasting route settings, so they are now faint (owner tuning); can be split out if wanted.
- Combat stims deferred (parking lot). Destructible asteroids in the parking lot.
- Claude Code's auto mode blocked tools partway through sessions on 2026-10-03; the in-app browser pane could not be clicked by Claude, so visual checks used headless screenshots (npm run shot and small Playwright scripts).

---

## 2026-10-03, milestone M3 (in progress): session handoff
Played: Flight test after M2 sign-off; leaving an orbit and parked positions for intercepts and other routes.
Felt wrong:
- BUG (fix first): intercept and other routes still fly through moons and asteroids when the ship leaves an orbit or a position near a body (behind or beside it). The ship must go around the body.
Where things stand:
- M2 signed off by the owner.
- M3 plan approved (see the M3 section of docs/ROADMAP.md). Step 1 is committed: loadouts, subsystem damage by hit direction, hit detection, collisions with bodies (99 tests passing).
- `src/data/weapons.ts` (torpedo tunables) is committed (7e5d171) and not used yet; step 2 will use it.
- The session ended early: Claude Code's auto mode began blocking all commands partway through step 2. No source files are half-edited.
Likely causes of the bug (from reading `routeAim` in `src/sim/autopilot.ts`):
1. The detour point is found by stepping outward up to 80 times. Near a zone edge (where orbits and clamped destinations put ships) it can fail, and it then returns its last guess even if that route still crosses the body.
2. Avoidance only checks a straight line to the detour point and ignores the ship's current momentum. A ship leaving orbit at about 960 m/s sideways can be carried through the zone. Fast pass (full forward thrust via `pushToward`) is the worst case.
3. A ship starting inside a zone falls back to the inner hard limit, still with a straight-line check only.
Proposed fix: write failing tests first (leaving an orbit for an intercept and a fast pass on a target behind the moon; departing from a zone edge to the far side; a fast ship heading at an asteroid with the target beyond; each must never enter the body). Then compute exact tangent-based detour points, add a momentum lookahead (project the current motion about a minute ahead and steer away if it enters a zone), and depart tangentially when leaving a body.
Next session: fix the routing bug above, then continue M3 at step 2 (torpedoes in the sim).

---

## 2026-10-03, milestone M2
Played: Flight test and holotable test; burn to point, intercept, fast pass, station-keep, orbit; time compression
Felt good: planning moves; the flip and arrival matching the prediction. "Everything else feels good."
Felt wrong (all fixed this session):
- After placing a point there was a delay before the route appeared, with nothing on screen. Now the placed point stays until the route is drawn, routes appear faster, and they work while paused.
- Station-keep (K) showed no route. Now it does when the ship has to travel.
- Bodies showed their back side; hard to tell which side you were looking at. Now solid with topographic contour lines.
- Routes went through moons and asteroids. Now the nav computer routes around bodies, and destinations inside a body's safety zone slide to its edge (amber MIN CLEARANCE).
Decided: gravity is on (DESIGN.md open question 3). Safety zones come from gravity: asteroids can be approached within about a kilometer; moons and planets keep ships out of the point of no return.
Added: Orbit order (R).
Confusing: zoomed out, a route that clears an asteroid by 30 km still looks like it crosses the asteroid's marker (the marker is far bigger than the rock). Left as is for now.
Next session: start M3 (weapons and the first fight)

---

## 2026-10-02, milestone M1
Played: holotable test scene, rotating, zooming, selecting and focusing; tuned values in the debug panel
Felt good: the overall look once tuned (softer bloom, finer grid, taller box, fainter axes). Saved as defaults.
Felt wrong: selection brackets were huge on the moon (sized to the whole sphere). Fixed: same size as on ships.
Confusing: tried a 3D grid (back-wall height grids and range spheres around the focus). Too confusing; reverted. Do not re-add without a new idea. A lighter option if height is ever hard to read: tick marks along drop lines.
Next session: start M2 (flight and the nav computer)

---

## 2026-10-02, milestone M0
Played: opened the game locally, rotated and zoomed the empty scene
Felt good: everything. Camera rotation, zoom and pan all feel right.
Felt wrong: nothing
Confusing: nothing
Next session: start M1 (the holotable)

---

## Fun debt

Places where the game works but is not fun yet.

- (none yet)

## Ideas parking lot

Features for later. Not for the current milestone.

- Orbit: choose the altitude by dragging; fuel-efficient transfers instead of stop-then-spin-up.
- Gravity: moving bodies (moons on their own orbits) and slingshot planning.
- Combat stims (DESIGN.md section 9): raise the G-strain limit for a while, then reduced efficiency; limited supply.
- Destructible asteroids: asteroids take damage from railgun slugs and torpedoes and break into fragments. Fragments become new objects (debris) that drift, block shots and routes, and can be cleared by PDCs (DESIGN.md already lists debris as a target). Moons and planets stay intact. Best after M3, once railguns exist; it changes cover, so look at it alongside M4 sensors and line of sight.
