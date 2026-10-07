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

## 2026-10-07, milestone M6: built, ready for the checkpoint
Next session: the owner connects Cloudflare Pages (docs/DEPLOY.md), plays the branch preview link, then runs the checkpoint: give the link to 3 to 5 people who have not seen the game and watch them play without explaining. Claude Code writes the M6 entry from the owner's notes, then fixes what the testers stumbled on first. Still unplayed by the owner: the M4 (Sensors Lite) and M5 (AI captain, 10 skirmishes) checkpoints; the testers' games will cover some of that ground.

How to play
- The link, https://test.project-ares.net/ (live since 2026-10-07, serving main), opens the skirmish setup screen; locally `npm run dev`, http://localhost:5173. The setup screen shows the build bottom right (BUILD commit · date): note it with the playtest notes.
- Bottom deck: Weapons control on the left (Torpedoes, Railgun, Point defense), Time in the middle (click a speed on the ruler, or `[` `]`, Space to pause), Helm on the right (order tiles light their status line while the order runs; thrust tabs; Sensors tile says what gives you away).
- SET in the Time panel opens Settings: colors (Standard, Red-green safe, Blue-yellow safe), Reduce effects, volume, UI scale, and Controls (rebind any key). Cmd/Ctrl + and − change the UI scale anywhere.
- After a fight: Replay on the result banner. Timeline (click or drag), Our view / Their view / All. Esc leaves the replay.

What M6 built (branch claude/m6-feel-polish, PR c4d30088/Project-Ares#7; 364 tests)
- Sound, synthesized live: drive rumble with flame flicker, PDC fire from single rounds, railgun transformer charge (from G, also while paused) and zip release, hits, kills, alarms through a ship-speaker filter, impact countdown beeps. You hear your own ship and what your side has detected. `N` mutes; the debug panel's Sound folder plays any sound on demand.
- Bottom deck (owner's pick D of four mockups in `mockups/hud-clusters.html`), centered as a group; it scales on narrower windows and lifts the Time panel above the row when it does not fit.
- Hit flicker on the table and alert strip animations, each with a slider; both off with Reduce effects.
- Settings with color-blind palettes (checked by a color-blindness simulation test), Reduce effects, volume, UI scale, remappable keys. Saved in the browser.
- After-action replay that re-runs the fight exactly from saved copies and your commands.
- Cloudflare Pages: repository ready, owner's steps in docs/DEPLOY.md.

Owner decisions this milestone
- Sound: realistic and serious, not playful (three rounds: hull echo, horn klaxon, single-round PDC, no bell tones; a rumblier, flickering drive; the railgun as a transformer charge and a zip release). Voice recordings are not usable (Claude Code cannot hear audio); descriptions and sound words work.
- Bottom HUD: option D, the console deck after the UX references, not hexes; weapons and helm the same height; bigger click targets for the time speeds.
- Large screens: UI scale on Cmd/Ctrl + and −; the deck centered next to the Time panel.
- Hosting: Cloudflare Pages.
- Jamming static left out: jamming itself is parked.

What Claude Code saw (not a real playtest)
- A Moon shadow skirmish against a Hunter, left to run with no orders: lost at 13:42 to overheating while running dark. In the replay's Their view the enemy did not know where we were until about 12:40; that is the kind of "why did I lose" the replay is for.
- Every control on the deck, every Settings option and the replay were clicked through in the browser; the production build was played through `npm run preview`.

Watch the testers for (the M6 checkpoint)
- Where they hesitate: finding how to move (the Helm), how to fire (the Weapons stations, then clicking a target), how to speed up time.
- What they never use: Sensors, Evade and Evasive, PDC modes, burst fire, the replay, Settings.
- When they lean in: the first launch warning and countdown beeps, the swarm, the railgun charge.
- Whether anyone can tell why they won or lost (and whether the replay helps).

Known limits
- No onboarding: a new player gets the setup screen and the table, nothing more. Expect hesitation; that is what the checkpoint measures.
- The debug panel (backquote key) is in the playtest build too; testers will not find it unless told.
- Labels on the 3D table do not follow the UI scale (they have their own sizes in the debug panel).
- A palette change reloads the game, so mid-fight it restarts the fight (the screen says so).
- Sound starts after the first click or key press (a browser rule).

---

## 2026-10-05, milestone M4 (Sensors Lite): built, ready for the checkpoint playtest
Next session: start with the playtest. The owner plays Moon shadow and Open duel (and anything else) and reports: could you tell whether the enemy knew where you were, and why; did going dark feel worth it; were the lost-contact markers clear; did Evade or Evasive maneuvers save you; were the weapon rings useful. Claude Code writes the M4 entry from it, then tunes (every number has a debug slider: Sensors folder, Weapon range rings, Nav computer, AI captain).

How to play
- `npm run dev`, open http://localhost:5173/ and pick Moon shadow or Open duel on the setup screen (1 v 1, Duelist is a good start).
- You start dark: drive off, Sensors off. The enemy starts knowing where you were at the start, and you where it was (orange LAST SEEN markers).
- Being seen: burning your drive (and 15 s after it stops), Sensors on, or firing (10 s) makes you visible at any range unless a moon or asteroid is in the way. Inside 1,000 km you are always seen. With Sensors on you find dark ships and cold torpedoes within 3,000 km.
- Running dark heats you up (left rail HEAT bar, about 10 minutes for a frigate); you cool only while visible.
- A contact nobody sees any more stays as a hollow orange marker where it was last seen ("LAST SEEN 01:20 AGO") with one dashed line along its last course. Orders and weapons fired at it aim along that line.
- Keys: `S` Sensors, `E` Evade (one 8 degree bend in your route for 30 s; you still arrive), `V` Evasive maneuvers (corkscrew at your G setting; cancels the route; the alert strip suggests it when something is inbound), `W` hides or shows your weapon range rings. Click an enemy to see its rings in red (orange and dashed if it is lost).
- Alerts: CONTACT, CONTACT LOST, ENEMY SENSORS ACTIVE, HEAT, HEAT CRITICAL. Time drops to 1x on a new contact.
- Debug panel: God view (Sensors folder) shows everything as it really is, to compare.

What Claude Code saw playing every map with bots (not a real playtest)
- A player who sits still, dark, PDCs on Auto: the enemy flies to where it was told you were and finds you with its sensors after 9 to 11 minutes on the long maps, then wins. On Moon shadow neither side sees the other for about 8 to 10 minutes.
- An AI Duelist standing in for you: beats Duelist on all five maps and Skulker on four (one draw); loses to Hunter on four (one draw).
- Knife fight: an asteroid sits exactly between the ships at the start, so neither sees the other until someone moves (about a minute).
- Rock garden against a Skulker: if you never shoot, it hides behind a rock with only its railgun left and the fight never ends. This happened before sensors too.

Worth your judgement (measured with PDCs held so only the dodge counts)
- Running straight away at Max G already beat every torpedo fired from 1,000 km or more before this milestone (M3 torpedo tuning). The corkscrew also beats torpedoes fired from about 1,500 km or more; from 1,000 km it does not help. Against the railgun almost any steady maneuvering spoils the shot at 150 km and beyond. If torpedoes feel too easy to dodge, the knobs are torpedo delta-v and homing reserve (Torpedoes folder).
- Slugs are still seen by both sides when fired (firing makes the shooter visible anyway).

Known limits
- No contact list; contacts gained and lost go in the alert log.
- Jamming, decoys, telescope and bearing-only tracks, lidar locks and sensor shadows are parked (ideas list).
- Torpedoes can be shot at only once seen: a dark (coasting) torpedo shows as a lost marker with a course line until it lights or comes within 1,000 km.

---

## 2026-10-05, milestone M4: Sensors Lite planned
Decided (owner): bring M4 back, much simpler. What made the first build hard: too many sensors, and the prediction clouds when a contact was lost. The new plan (ROADMAP M4, "Sensors Lite"): one Sensors switch; loud ships (burning, sensors on, just fired) are seen at any range in line of sight; anything inside 1,000 km is seen; Sensors on finds dark ships and cold torpedoes within 3,000 km; a lost contact leaves one LAST SEEN marker and one dashed course line; a heat limit on running dark. Also weapon range rings on the grid, and two new orders: Evade (one slight bend per press) and Evasive maneuvers (corkscrew).
Claude Code pointed out: Knife fight and Rock garden start inside 1,000 km, so stealth does not change them; Evade needs the drive, so it gives you away; the corkscrew sweeps your PDC arcs.
Next session: build the steps in ROADMAP M4 in order.

---

## 2026-10-04, milestone M4: played, then iceboxed
Played: M4 steps 1 to 6 (sensors: tracks and uncertainty, contact list, radar and lidar, weapons and the enemy on the sensor picture, Behind the moon).
Felt wrong (owner): the whole milestone makes the game very complicated and hard to play.
Decided (owner): put M4 in the icebox. The code went back to the M3 game (perfect information); the M4 work is saved on the branch `icebox/m4-sensors`. (This entry was written on a branch that never reached main; copied here on 2026-10-05.)

---

## 2026-10-04, milestone M5: build complete, ready for the checkpoint playtest
Next session: start with the playtest. The owner plays 10 skirmishes and reports: did you win some and lose some; when you lost, could you name what the AI did; did any personality feel wrong; was any map unfair or dull. Claude Code writes the M5 playtest entry from it, then tunes (every AI number has a debug slider under "AI captain").

How to play
- `npm run dev`, open http://localhost:5173/. The setup screen opens first: pick a map, 1 v 1 or 1 v 2, and Hunter, Duelist or Skulker, then Start. When it ends the banner offers Restart and Back to setup.
- Maps: Open duel (long range, torpedoes), Pincer (long range, built for 1 v 2), Moon shadow (mid range, cover), Rock garden (mid range, 900 km apart in an asteroid cluster), Knife fight (150 km apart; PDC range).
- The usual controls apply (see CLAUDE.md). Fights take about 5 to 25 minutes; speed up with `]`.

What Claude Code saw playing the maps with bots (not a real playtest)
- Every map ends in a result, between 2 and 25 minutes; results vary with the personalities on both sides (a bot run of every map against every personality gave 11 wins, 22 losses and 12 draws for the bot standing in for you).
- A player who does nothing but leave PDCs on Auto still beats a lone AI in Knife fight: the AI fires all 12 torpedoes in two volleys, the PDCs shoot them all down, and it then runs dry and breaks off. That comes from the M3 weapon tuning (PDCs are very strong at 150 km), not from the AI; worth your judgement.
- Moon shadow: both sides run for their own side of the moon, so whoever lands torpedoes first usually wins; the AI side starts already closing, which gives it a small edge.
- Fixed while testing: a captain with no torpedoes left kept backing away and turning back to shoot; a retreating ship burned at Combat G until its crew was at full strain.

What it cannot show yet
- "The AI never seems to know something it could not have seen": sensors are iceboxed (M4), so every side sees everything. The captains read only the sensor-picture interface, so this changes by itself when sensors return.
- Emissions discipline only changes how many salvos launch cold; it has no stealth effect until M4.
- Not yet measured: whether evading torpedoes (a hard burn across their line) actually saves the ship. It is tested to trigger and to use Max G, not to work. Watch for it.

---

## 2026-10-04, milestone M3: first playtest notes (all fixed)
Played: First fight (the owner; number of fights and results not recorded).
Felt wrong (owner), all done this session:
- Torpedo symbols were red (enemy) and blue (ours). Now green ours, yellow theirs, like the rest of the weapon fire. The "red swarm" in the docs is now a yellow swarm.
- Nothing showed when a weapon hit. Now: a spherical bloom for torpedo hits (bigger for a ship kill), sparks for PDC and railgun hits, and floating hit text above the struck ship (HULL -35%, SENSORS -70%, RAILGUN OFFLINE, DESTROYED). The text shows above any ship that is hit; "hit text on our ships" in the debug panel limits it to the enemy.
- Hard to keep track of a long fight. The alert log (right panel, replacing the Contacts placeholder) lists everything with its time, newest first, merging quick repeats ("8 torpedoes destroyed"). The top strip still shows the live countdowns. The contact list returns in M4.
- Debug panel: a search box at the top and a one-line explanation under every control (145 of them).
Saved tuning: torpedo symbols pulse 2.7 Hz down to 0.32 brightness.
Claude Code's own smoke run of the First fight (not a real playtest): sat still with PDCs on Auto, fired one 2-torpedo salvo (shot down by the enemy PDCs) and one railgun shot; lost to the third torpedo wave at 20:34 (wave 1 of 8 leaked 1, wave 2 leaked 0, wave 3 killed a ship already at 65% hull). Time dropped back to 1x on every enemy launch wave and again inside 60 s of impact, so most of the fight was at 1x. It was hard to tell from the table why wave 3 got through; the hit text and log now show what each hit took, but not yet which PDC missed which torpedo.
Next session: the owner plays the First fight with the new effects and log and reports the usual: was the swarm tense, were your salvos worth it, did the railgun matter, could you read the table, anything unfair. Tune from there.

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
- From the first M4 build, dropped by Sensors Lite (2026-10-05): jamming, decoys and ghost contacts, telescope and bearing-only tracks, triangulation, lidar locks, classification confidence, uncertainty clouds, a contact list tab, sensor shadow volumes, datalink lines and cut links. The code is on branch `icebox/m4-sensors`. Jamming static on the table (M6 list) comes back with jamming.
- Comms chatter (DESIGN.md open question 5): short crew call-outs on launches, hits and contacts. Left out of M6's sound pass.
- Onboarding (Phase 4 in the roadmap) may need to come earlier if the M6 testers cannot find their way.
- Destructible asteroids: asteroids take damage from railgun slugs and torpedoes and break into fragments. Fragments become new objects (debris) that drift, block shots and routes, and can be cleared by PDCs (DESIGN.md already lists debris as a target). Moons and planets stay intact. Best after M3, once railguns exist; it changes cover, so look at it alongside M4 sensors and line of sight.
