# Project Ares: Roadmap

> **This is a video game.** Project Ares is a fictional, single-player browser strategy game set in an invented far-future solar system. Every ship, weapon, sensor, faction, and number in this project is made-up game content, tuned for fun in playtesting. None of it describes or models real-world military equipment, and the code is ordinary game code: 3D rendering, game physics, UI, and AI opponents.

Combat comes first. The career layer, setting, and multiplayer wait until a single-ship fight is fun to play over and over.

Each milestone ends with a **playtest checkpoint**: something you do in the game, and what "good" feels like. You judge the checkpoint by playing, not by reading code. Do not start the next milestone until the checkpoint passes or you have consciously decided to move on.

Session estimates assume a sitting of 1 to 3 hours with Claude Code. They are rough; physics and AI work is the least predictable.

---

## Phase 1: Single-ship combat core

### M0. Project setup (1 session)

**Build**
- Vite + TypeScript + three.js + React + Vitest + lil-gui + Playwright
- Folder layout from `docs/ARCHITECTURE.md`
- git repo with `.gitignore` (reference image folders excluded)
- `npm run dev`, `npm test`, `npm run build`, `npm run shot` all working
- A black scene with an orbit camera

**Checkpoint:** The game opens in your browser. You can rotate the camera around an empty dark space.

**First prompt**
> Read CLAUDE.md and everything in docs/. We are starting milestone M0 from docs/ROADMAP.md. Plan the setup first and show me the plan. After I approve, set up the project, initialize git, make the first commit, and tell me exactly how to open the game in my browser.

---

### M1. The holotable (2 to 4 sessions)

**Build**
- Bounding box with glowing reference-plane grids and labeled XYZ axes
- Logarithmic zoom, orbit, pan, focus on selection, snap to top-down
- Floating origin and logarithmic depth buffer
- Color tokens in `palette.ts`, fonts loaded
- Symbol set for all ship classes, unknown contacts, torpedoes, bodies, stations
- Drop lines from every object to the reference plane
- Bloom and chromatic split, with debug sliders
- A static test scenario: a moon, a few asteroids, 3 friendly ships, 3 hostile ships, a swarm of 20 hostile torpedoes, at varied heights
- HUD shell: empty left rail, right rail, bottom bar, top alert strip, with chamfered panel styling

**Checkpoint:** Rotate the camera around the test scene for 10 seconds. You can say which ships are above or below you, which are hostile, and which class each one is, without hovering anything. It looks like it belongs next to the reference images.

**First prompt**
> Start M1 from docs/ROADMAP.md. Read the visual language section of docs/DESIGN.md and look at the images in "UX reference/" first. Plan the holotable, the symbol set, and the static test scenario. Take screenshots as you go and compare them against the references.

---

### M2. Flight and the nav computer (3 to 5 sessions)

**Build**
- Fixed-timestep sim with ships that have mass, acceleration limits, and turn rates
- Commands: burn to point, intercept (rendezvous and fast pass), match velocity, station-keep, coast, orient
- G setting (Cruise, Combat, Max)
- Ghost-run prediction: solid burn arcs, dashed coast arcs, flip marker with countdown, arrival ring with ETA
- 3D point placement (click plane, drag for height, snap to objects)
- Time controls: pause, 1x to 1024x, auto-slowdown rules
- `SensorPicture` interface returning perfect information
- Unit tests for autopilot accuracy and determinism

**Checkpoint:** Order your frigate to a point 5,000 km away and above the plane. Watch it burn, flip at the marked point, and arrive at rest where the ring said, at the ETA it showed. Then order an intercept on a coasting target. Planning a move should feel satisfying even with nothing shooting at you.

---

### M3. Weapons and the first fight (4 to 6 sessions)

**Build**
- Torpedoes: hot and cold launch, salvo size, guidance, delta-v budget
- Intercept lines with predicted impact point and countdown
- Manual targeting for every weapon: pick a ship, an object, or a point in space (point placement reuses the nav waypoint tool)
- PDCs: arcs, domes, Auto / Manual / Hold modes per PDC, target switching time, ammunition, saturation
- Railguns: light turret railgun on the frigate, lead point, slug flight, recharge, ammunition
- Subsystem damage with hit direction
- G-strain meter
- Left rail ship status panel and top alert strip working
- A scripted enemy that approaches and fires salvos on a timer
- Unit tests for intercept prediction and PDC saturation

**Checkpoint:** Fight the scripted enemy 5 times. Use each target type at least once: a torpedo salvo at the ship, a railgun shot at a point where you expect it to be, PDCs set to Auto and then switched to Manual. At least once, a yellow swarm closing on your ship should make you lean toward the screen. You should be able to say why each torpedo that hit you got through.

**Stop rule:** If the torpedo and PDC exchange is not tense after three rounds of tuning, stop and rethink the weapons interaction before building sensors. Sensors make a good fight better. They will not rescue a flat one.

**Approved plan (2026-10-03).** Every weapon takes a `Target` (track, object or point); only PDCs have Auto. Sensors stay perfect until M4: seekers and PDC Auto use ground truth within their range. Starting numbers live in `src/data/combat.ts` and `src/data/weapons.ts`, with debug-panel sliders.
- Torpedoes (frigate: 2 tubes, 12 in the magazine): 30 g, 15 km/s delta-v with a 3 km/s terminal reserve. Salvo size 1/2/4/6; tubes reload between shots, so big salvos leave in waves, but (decided in step 7) the early torpedoes wait dark and the whole salvo lights together. Hot launch lights the drive at once; cold launch coasts and lights at 2,000 km. At a ship: miss-distance homing (the same law as fast pass). At an object: strike it. At a point: fly there, then the seeker searches; if nothing is found, wait as a mine until a timer, then self-destruct. Proximity fuse; no fuse on friendlies.
- PDCs (frigate: 4 mounts): firing arcs drawn as domes; Auto / Manual / Hold per mount or all; kill chance rises as range falls (max 50 km, effective 15 km); 0.3 s target switch; finite ammo; kill rolls use the seeded RNG.
- Railgun (frigate: light turret): 20 km/s slug, limited turret arc, recharge and ammo; lead point shown for ship targets; slug flies ballistically (gravity bends it).
- Damage: done in step 1. Subsystem health, hit side picks the subsystem; drive damage caps acceleration; zero hull or reactor destroys; flying into a body destroys.
- G-strain: builds above Cruise G, recovers below; slows turns and lowers PDC accuracy; full strain causes crew casualties.
- HUD: intercept lines from each torpedo to an impact X with countdown (hostile lines red); railgun lead point; weapons row in the bottom bar (torpedo salvo size and Hot/Cold, railgun, PDC modes), targeting reuses the order tool; left rail status panel (subsystems, ammo, magazine, railgun charge, G-strain); top alert strip (LAUNCH DETECTED, IMPACT T-mm:ss, HULL BREACH, PDC n OFFLINE).
- Scripted enemy frigate that closes to torpedo range and fires salvos on a timer, using commands only. "First fight" scenario and a restart button in the debug panel.
- Tests: impact prediction and railgun lead match the real flight; PDC saturation statistics over many seeded runs; torpedo never exceeds its fuel budget; damage direction and effects; G-strain; determinism.

Build order (one commit per step):
1. Loadouts, subsystem damage, hit detection, collisions with bodies. **Done.**
2. Torpedoes in the sim: launch command and tube queue, guidance, fuel, seeker, mines, fuse and impact. **Done.**
3. Torpedo targeting UI, intercept lines with impact X and countdown, launch alert. **Done.**
4. PDCs and domes. **Done** (plus tracer rounds, round counts, burst fire).
5. Railgun. **Done** (slugs are untrackable: both sides see only the shot and its predicted path).
6. G-strain, left rail status panel, alert strip. **Done** (combat stims deferred).
7. Scripted enemy, First fight scenario, tuning. **Done** (salvo hold adopted).
8. Playtest fixes after the owner's first fights (2026-10-04): torpedo colors, impact effects and hit text, alert log, debug panel search and explanations. **Done.**

**Status (2026-10-04):** everything in the build list is in. Next: the owner plays the checkpoint (First fight, 5 times); M3 passes on that, or gets another round of tuning.

---

### M4. Sensors and stealth (4 to 6 sessions; rebuilt as Sensors Lite, see below)

**Build**
- Signatures: drive plume, heat, radar cross-section, emissions
- Telescope, radar, lidar with ranges and costs from the design table
- Line of sight blocked by bodies; sensor shadow volumes on the table
- Weapons target by line of sight (owner, 2026-10-03): a ship hidden behind an asteroid or moon is hard to hit, harder the deeper it hides. A torpedo's seeker needs line of sight; when its target slips out of view it flies on the last position and motion it saw (its intercept line turns amber) and reacquires only if it comes back into view with fuel to correct. Firing at a hidden ship aims at its stale track.
- Contact list returns to the right rail (the alert log took its place in M3): class, confidence, range, closing rate
- Local picture per ship and shared picture per datalink network, with contributors recorded on every track
- Tracks with uncertainty regions and classification confidence
- Stale tracks: when the only ship seeing a contact is lost, the track freezes, turns amber, and fades
- Passive bearing-only tracks that firm up over time
- Running dark with heat buildup and venting
- Jamming: amber tracks, trajectory cones, display breakdown when you are jammed
- Decoys and ghost contacts
- God view debug toggle
- Unit tests for detection ranges, line of sight, and stale tracks

**Checkpoint:** Play a scenario where the enemy starts behind a moon. You should feel the difference between knowing where they are and guessing. Try one ambush: launch cold torpedoes from cover and light them late. It should work sometimes and fail for a reason you can see.

**Iceboxed (2026-10-04).** Steps 1 to 6 of the first M4 plan (telescope, radar and lidar; tracks with uncertainty clouds; classification; contact list; weapons and the scripted enemy on the picture) were built and played. Owner: "the whole milestone makes the game very complicated and hard to play." The code was set aside on branch `icebox/m4-sensors` and never merged to main; M5 was built on perfect information instead.

**Sensors Lite: approved plan (2026-10-05).** M4 returns, much simpler. The owner names what made the first version hard: too many sensors, and the prediction clouds when a contact was lost. It is rebuilt on today's main (with the M5 AI captain), reusing pieces of the icebox code.
- One switch: **Sensors** on or off (radar and lidar merged; no telescope, no lidar lock). Seen means known: class, name and weapon rings at once, no UNKNOWN steps.
- A ship sees a contact when there is line of sight (bodies block it) and any one of these holds: the contact is **loud** (drive burning, Sensors on, or fired a weapon in the last 10 s), seen at any range even with your sensors off; the contact is within **1,000 km** (proximity); or the observer has **Sensors on** and the contact is within **3,000 km** (how dark ships and cold torpedoes are found). Dark means coasting, sensors off, not firing. Cold torpedoes follow the same rules.
- A lost contact (or cold torpedo) leaves a hollow orange marker frozen where it was last seen, `LAST SEEN mm:ss`, and one dashed line along its last course. No clouds, no moving guess. It fades after a few minutes. Weapons fired at it aim where the line says it would be now.
- Heat: one bar fills while dark (about 10 minutes for a frigate) and cools whenever you are loud. To cool down you must show yourself. At full heat the ship takes slow damage (HEAT CRITICAL).
- Weapon range rings on the grid: flat rings under each ship (torpedo, railgun, PDC). Own ships always (a key hides them); a selected enemy in red; a lost one dashed orange at its last-seen marker.
- Two new orders. **Evade**: each press bends the current route a few degrees for about 30 s; the nav computer steers back and still arrives. **Evasive maneuvers**: cancels the route and corkscrews at the chosen G; the hull turns with the thrust, so PDC arcs sweep. Manual only; the alert strip suggests it when something is inbound.
- Dropped (parking lot): jamming, decoys, telescope and bearing-only tracks, lidar locks, classification confidence, uncertainty clouds, contact list tab, sensor shadows. The datalink stays internal: one network per side, every track records which ships see it (hard rule 11), no UI.
- Known: Knife fight (150 km) and Rock garden (900 km) start inside the 1,000 km proximity range, so stealth does not change those two maps.

Build order (one commit per step):
1. Docs (this plan, DESIGN.md, playtest log).
2. Weapon range rings.
3. Sensors in the sim: seeing rules, line of sight, Sensors command, per-side pictures with contributors, lost contacts, God view. Tests.
4. Table and HUD: last-seen marker and course line, Sensors button, emissions state in the left rail, CONTACT / CONTACT LOST / ENEMY SENSORS ACTIVE alerts.
5. Weapons use the picture: torpedo seekers need a sighting (else fly on the last one), PDC Auto only at what the side sees, aim at a lost contact's line.
6. Heat.
7. AI captain and scripted enemy on their own picture: emissions discipline decides sensors and running dark; a hunt behavior so no one waits forever.
8. Evade and Evasive maneuvers, with tests of arrival and of how much the corkscrew helps.
9. Tuning with bots on every map, docs and handoff.

**Status (2026-10-05):** all nine steps are built on branch `claude/m4-sensors-lite` (one commit each). Added while building: each side starts briefed on where every enemy ship was (as a lost contact), so a dark ship can be hunted; torpedo guidance leads the target's average acceleration so a corkscrew does not fool it. Next: the owner plays the checkpoint below and reports; tuning follows.

**Checkpoint (Sensors Lite):** On Moon shadow and Open duel, you can say whether the enemy knows where you are, and why. Going dark behind the moon and launching cold torpedoes works sometimes and fails for a reason you can see (you burned, you fired, or they had sensors on within 3,000 km). The rings tell you, before you move, when you are about to enter enemy torpedo or railgun reach.

---

### M5. AI captain and skirmish mode (3 to 5 sessions)

**Build**
- Utility AI using the same commands and only its own sensor picture
- Personality settings: aggression, caution, emissions discipline
- Skirmish setup screen: pick scenario, enemy count (1v1, 1v2), AI personality
- Win and loss conditions
- 4 to 6 hand-built scenarios covering all three range phases

**Checkpoint:** Play 10 skirmishes. You win some and lose some. When you lose, you can name what the AI did. The AI should never seem to know something it could not have seen.

**Approved plan (2026-10-04).** M4 (sensors) is iceboxed, so every side still sees everything. The AI reads only the sensor-picture interface (its own side's view); when sensors return it sees less with no AI change. Until then, "never knows what it could not have seen" cannot be judged by playing; the rest of the checkpoint can. Emissions discipline is stored and shown but has no effect until sensors return.
- AI captain (`src/sim/ai/captain.ts`): utility AI scoring approach, keep range, launch salvo, evade, take cover behind a body, retreat, once a second. Commands only. Reuses the group salvo timing. Tunables in `src/data/ai.ts`.
- Personalities: aggression, caution, emissions discipline. Presets Hunter, Duelist, Skulker.
- Win: all hostile ships destroyed, or the AI retreats out of the area. Loss: your ship destroyed. Result banner with Restart and Back to setup; result goes in the alert log.
- Skirmish setup screen (owner, 2026-10-04): the game opens to it on the bare URL, for testing AI scenarios. `?scenario=` links and `npm run shot` skip it. Pick scenario, enemy count (1v1, 1v2), AI personality.
- Five hand-built scenarios: long-range torpedo duel, mid-range railgun fight around asteroids, close-range PDC knife fight in an asteroid cluster, two on one from different directions, moon cover.

Build order (one commit per step):
1. AI captain in the sim, with tests (determinism, picture only, personalities differ).
2. Personality presets and settings.
3. Win and loss, banner, alert log line.
4. Skirmish setup screen.
5. Five scenarios.
6. Docs and playtest log.

Status (2026-10-04): all six steps are built (steps 1 to 5 each one commit; two AI fixes found by playing the maps with bots, one more commit). Step 2 (personalities) was built inside step 1. Next: the owner plays the checkpoint (10 skirmishes); M5 passes on that, or gets a round of tuning. What no play can show yet: the AI never knowing what it could not have seen, because sensors are iceboxed (M4).

---

### M6. Feel and polish pass (2 to 4 sessions)

**Build**
- Audio: alarms, launch warnings, PDC fire, drive rumble, impacts
- Hit flicker, jamming static, alert animations
- After-action replay showing both sides' sensor pictures on a timeline
- Accessibility basics: color-blind palette, effect sliders, remappable keys
- Playtest build deployed to a shareable link

**Checkpoint:** Give the link to 3 to 5 people who have not seen the game. Watch them play without explaining anything. Write down where they hesitate, what they never use, and when they lean in. Those notes decide what Phase 2 fixes first.

---

## Phase 2: Attack group (outline)

- Select and command multiple ships; group orders and formations
- Datalink across the group: shared picture, passive triangulation, visible link lines, links cut by line of sight or jamming
- Scouting: send a picket ahead; what it sees, everyone sees; when it dies, what it saw goes stale
- Orders to AI captains: engage target, weapons free, weapons hold, defend ship
- Coordinated salvos (time-on-target from multiple ships)
- Overlapping PDC coverage visualized
- Escort AI that follows simple standing orders
- Checkpoint: a 3-ship group beats a single heavier ship through coordination, not numbers alone. Losing your scout should hurt in a way you can see on the table.

## Phase 3: Fleet (outline)

- Subordinate group commanders with doctrine settings
- Fleet-level orders and objectives
- Performance work for 40 ships and 400 torpedoes (likely moving the sim to a Web Worker)
- Checkpoint: a fleet battle where the player's job is directing, not micromanaging, and it still feels tense

## Phase 4: Career (outline)

- Original setting and factions (decide open question 1 in DESIGN.md first)
- Mission board, rank, refits, persistent damage and losses, save system
- Onboarding: the first 30 minutes teach one concept at a time in safe situations, then test it under pressure

## Phase 5: Multiplayer (outline)

- Server-authoritative PvP running the headless sim in Node
- Only after the single-player game is fun

---

## How to work with Claude Code (for a non-coder)

### One-time setup

1. Install Node.js (the LTS version) and git.
2. Create a free GitHub account and a private repository for the project. Claude Code can connect it for you.
3. Open Claude Code in the Project Ares folder. It reads `CLAUDE.md` automatically at the start of every session.

### Every session

1. Start by telling Claude Code which milestone you are on and what you noticed last time (or point it at the latest `PLAYTEST_LOG.md` entry).
2. Ask for a plan before any code. Read the plan. If something doesn't match what you want, say so now. It is cheaper than fixing it later.
3. Let it build in small steps. After each step, it should tell you what to try in the game. Try it.
4. When something feels wrong, describe what you saw and what you expected, not how to fix it. "The flip happened way before the marker" is more useful than "change the autopilot."
5. End the session with a commit and a short entry in `PLAYTEST_LOG.md`.

### When things go wrong

- If a change breaks the game and one attempt to fix it fails, ask Claude Code to go back to the last working commit. That is what the commits are for.
- If the same bug keeps coming back, ask for a unit test that reproduces it before the fix.
- If a session drifts into a long chain of fixes, stop, start a fresh session, and restate the goal.

### Tuning without code

The lil-gui debug panel (toggle with a key Claude Code will set up in M1) holds every number in the game. Change a value, play, change it again. When something feels right, press "copy values" and ask Claude Code to save them into the data files.

### Two lists to keep

- **Fun debt** (in `PLAYTEST_LOG.md`): places where the game works but isn't fun yet. Review it at the start of each milestone.
- **Ideas parking lot**: features you want later. Writing them down keeps them out of the current milestone.
