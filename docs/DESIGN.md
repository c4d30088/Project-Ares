# Project Ares: Game Design

> **This is a video game.** Project Ares is a fictional, single-player browser strategy game set in an invented far-future solar system. Every ship, weapon, sensor, faction, and number in this project is made-up game content, tuned for fun in playtesting. None of it describes or models real-world military equipment, and the code is ordinary game code: 3D rendering, game physics, UI, and AI opponents.

Status: draft v0.1, combat-first. Numbers in this document are starting values for playtesting, not final balance.

## 1. Pitch

You command warships in a hard-ish Newtonian solar system, seen through a holographic tactical table. You never see a ship model. You see wedges, chevrons, glowing trajectory arcs, swarms of yellow dots, and the translucent domes of point defense. Combat is about where things are going, what you can see, and what can see you.

You start as captain of one frigate. Earn rank and you command an attack group. Earn more and you command a fleet. The verbs carry up from ship to fleet; each tier adds new ones.

## 2. Design pillars

1. **Trajectories over positions.** The display always shows where things are going and when they get there. Every decision is made against a predicted future.
2. **Information is a weapon.** You only know what your sensors tell you. Thrust makes you visible. Going dark makes you slow and hot. Planets, moons, and asteroids block line of sight.
3. **Saturation decides fights.** Point defense can kill any single torpedo. It cannot kill all of them at once. Most battles turn on whether a salvo overwhelms a defense.
4. **Instant readability.** A glance at the table tells you who is friendly, who is hostile, what is incoming, and how long you have. Color means something every time it appears.
5. **Orders, not twitch.** You are a captain, not a pilot. Pausing is always allowed. Skill is planning, timing, and reading the picture.

## 3. Progression tiers

| Tier | You control | New verbs at this tier |
|---|---|---|
| Captain | 1 ship | Nav orders, G setting, weapons, PDC modes, sensor and emissions control |
| Group commander | 2 to 5 ships (flagship + escorts) | Formations, datalink (shared sensor picture, passive triangulation), scouting, coordinated salvos, overlapping PDC coverage |
| Fleet admiral | 3 to 6 groups, 10 to 30 ships | Group objectives, doctrine settings for AI subordinate captains, scout and picket networks, protecting the datalink, reserves |

The player can still give direct orders to any ship at higher tiers, but the game is balanced so that working through subordinates is the better play.

## 4. The combat loop

1. **Detect.** Contacts appear as tracks with a confidence level. Passive sensors give bearing first, range later.
2. **Decide posture.** Burn hard (fast, visible), coast dark (slow, hidden, heating up), or use a planet or asteroid as cover.
3. **Maneuver.** Give nav orders. Watch the predicted arc, the flip point, and the arrival time.
4. **Exchange.** Launch torpedo salvos, set PDC modes, line up railgun shots, jam.
5. **Survive the merge.** Incoming swarms, PDC saturation, damage, crew strain.
6. **Resolve.** After-action replay shows both sides' pictures so the player learns why they won or lost.

## 5. Time and scale

Real-time with pause. Time compression steps: 1x, 4x, 16x, 64x, 256x, 1024x.

Compression drops to 1x automatically when any of these happen (each one is a toggle in settings):
- A new contact is detected
- A launch is detected
- An incoming threat is inside 60 s time-to-impact
- A nav order completes or a flip begins
- The player's ship takes damage

One battle can pass through all three ranges. Scenarios can start in any phase.

| Phase | Range | Typical activity | Typical compression |
|---|---|---|---|
| Strategic approach | 100,000 km and beyond | Passive detection, choosing to burn or go dark, using bodies for cover, long-range cold torpedo launches | 256x to 1024x |
| Torpedo exchange | 1,000 to 50,000 km | Sensors on or dark, salvos, intercept lines | 4x to 64x |
| Merge | Under 500 km | Railguns, PDC fire, evasive burns, terminal torpedo homing | 1x |

The camera zoom is logarithmic so the same table works from 100 m to a billion meters.

## 6. Movement

### Physics

- True inertia. Velocity persists until changed by thrust.
- Ships have a main drive (thrust only along the bow) and slow attitude thrusters for turning.
- Turning takes real time. A frigate needs about 12 s to flip 180 degrees, and the main drive is off during the flip.
- Celestial bodies are on fixed positions during a battle. They are obstacles and sensor occluders, and they have gravity: everything that moves is pulled by every body (decided during M2; see open question 3). Coasting paths curve near moons and planets; guided burns cancel the pull, and a ship holding station near a body hovers on its drive.
- Each body has a safety zone that routes go around and destinations cannot be inside: the larger of its surface (with a small clearance) and its gravity point of no return, where the pull reaches half the ship's Cruise acceleration. Low-gravity asteroids can be approached within about a kilometer; heavy planets push the zone far out, more so for ships with weaker drives.

### Nav computer orders

The player gives intents. The nav computer flies them.

| Order | What it does |
|---|---|
| Burn to point | Arrive at a point at rest. Produces the classic accelerate, flip, decelerate (brachistochrone) path. |
| Intercept | Fly to a target's predicted position. Options: rendezvous (match velocity at arrival) or fast pass (no flip, maximum closing speed). |
| Match velocity | Null relative velocity with a target or body. |
| Station-keep | Hold position relative to a body, ship, or point. |
| Evade | One slight bend in the current route per press: the burn turns a few degrees off-line in a random direction for about 30 s, then the nav computer steers back and still arrives at the same destination. Spoils railgun leads and the enemy's guess of your course (owner, 2026-10-05). |
| Evasive maneuvers | Cancels the current route and corkscrews at the chosen G: the thrust circles around the line of travel. The hull turns with the thrust, so PDC arcs sweep around. Strong against railgun slugs; against torpedoes it only drains their homing fuel. Manual only; the alert strip suggests it when something is inbound (owner, 2026-10-05). |
| Coast | Drive off. Required for running dark. |
| Orient | Point the bow along a direction or at a target, for railgun shots, PDC arcs, or minimum cross-section. |
| Orbit | Enter a circular orbit around a moon or asteroid, just outside its safety zone. Flies to the nearest point on the orbit, burns up to orbital speed, then coasts with the drive off; small corrections only if it drifts. |
| Manual burn | Direction, G level, and duration. For experienced players. |

Every movement order takes a G setting: **Cruise** (crew-safe), **Combat** (strain builds slowly), **Max** (strain builds fast). Higher G means faster arrival, a brighter drive plume, and tired crew.

### Placing points in 3D

Press on the reference plane to set the horizontal position, drag up or down to set height, and release to confirm. No modifier key is needed: while an order is being placed, left-drag does not rotate the camera (right-drag still pans). Clicking a body or contact snaps to it. A vertical drop line and a range/height label show the point while dragging. Esc cancels.

### What the player sees

- The predicted path, drawn solid where the ship is burning and dashed where it is coasting
- The flip marker, with countdown: `FLIP T-02:14`
- The arrival ring, with ETA and arrival velocity
- The current thrust vector as a short bright line from the icon

The prediction is produced by running the same autopilot forward on a copy of the ship, so what the player sees is what will happen unless something interferes.

## 7. Weapons

### Targeting rules

- Every weapon can be aimed manually at any of three target types:
  - **A ship or contact** (any track, including uncertain amber tracks)
  - **An object** (asteroid, moon, station, debris)
  - **A point in space** (placed the same way as a nav waypoint: click the plane, drag for height)
- **Only PDCs have an automatic mode.** Torpedoes and railguns fire only when the player gives the order. This keeps the big decisions in the player's hands.
- Firing at an uncertain track aims at the center of its uncertainty region. Hit chance falls as the region grows. The table shows the expected hit chance before you commit.
- Firing at a point is how you shoot at something you cannot currently see: where you think a ship is hiding, where it will emerge from behind a moon, or across a lane you want to deny.
- At group and fleet tiers, the player's own ship stays fully manual. Other ships are run by AI captains who choose their own targets inside the orders the player gives them (`engage target`, `weapons free`, `weapons hold`, `defend ship`). That is a captain making decisions, not an automatic weapon.

| Weapon | Ship or contact | Object | Point in space | Auto mode |
|---|---|---|---|---|
| Torpedoes | Homes on the target | Flies to and strikes the object | Flies to the point, then its seeker searches and engages the first hostile it detects. If it finds nothing, it coasts dark as a mine until its timer runs out. | No |
| Railguns | Fires at the predicted intercept point (lead) | Fires at the object | Fires along the line to that point | No |
| PDCs | Streams fire at a ship or a specific torpedo | Fires at the object (clearing debris, hitting a station) | Fires a barrage curtain at that point | Yes |

### Torpedoes

- Self-guided missiles with their own drive. Starting values: 30 g acceleration, 15 km/s delta-v budget, with part of it reserved for terminal homing.
- Guidance leads the target's drive acceleration averaged over the last 15 s, not this instant's, so a corkscrewing target does not send it chasing empty space (2026-10-05).
- Launch modes: **Hot** (drive lights at launch, fast and visible) or **Cold** (ejected and coasting, drive lights late, hard to detect).
- Salvo size and spread are player choices. Small salvos are easy to stop. Large salvos empty the magazine.
- A salvo bigger than the ship's tubes still arrives as one wave: the first torpedoes out wait beside the ship, drive dark, until the last leaves its tube, then all light together (decided 2026-10-03; without it a two-tube ship's salvo arrived in pairs and four PDCs stopped every pair).
- A salvo can be split across several targets or points.
- When torpedoes are in flight, the table draws thin converging lines from each one to the predicted impact point, marked with an X and a countdown.
- Hostile torpedoes are bright red torpedo shapes, each pointing the way it flies. A swarm closing on one blue wedge is the signature image of the game.
- Torpedoes in flight take the weapon-fire colors: green if ours, yellow if the enemy's (decided 2026-10-04). Enemy torpedoes pulse. A swarm of yellow dots closing on one blue wedge is the signature image of the game.

### Railguns

- Kinetic guns firing a slug at about 20 km/s. Frigates and destroyers carry a light railgun on a limited turret. Cruisers and capital ships carry heavy spinal railguns fixed along the keel, so the whole ship must turn to aim.
- A ship you can see gets an exact firing solution, with the lead point shown on the table. A lost contact is aimed at where its last-seen course line says it would be now; a point can always be fired at. (Lidar locks were dropped with Sensors Lite, 2026-10-05.)
- A projectile leaves with the firing ship's velocity plus the gun's muzzle velocity (owner, 2026-10-04): slugs and torpedoes, and the PDC tracer rounds, all inherit the ship's motion. Aim is worked out in the ship's own frame, so a fast-moving ship cancels its own drift when it leads a target, and a target that is outrunning the muzzle speed gives "no firing solution" instead of a wasted shot.
- Slugs cannot be tracked in flight: each side sees the shot and its predicted path, and firing makes the shooter loud for a few seconds.
- Long flight times mean a maneuvering target can dodge at range. Effective range against an evading target is low hundreds of km. Against a coasting target it is much longer. This punishes coasting dark near enemies.
- Limited ammunition and a recharge time between shots. Spinal guns hit much harder and recharge much slower.

### Point defense cannons (PDCs)

- Rapid-fire turrets with firing arcs. Drawn as translucent domes or cones from the hull, in the owner's color.
- Starting values: maximum range 50 km, effective range 15 km. Kill chance per gun per second rises as range falls.
- Each PDC engages one target at a time and needs about 0.3 s to switch. This creates saturation: 4 PDCs facing 12 torpedoes inside a 3 s window will miss some.
- Modes, set per PDC or for all PDCs at once:
  - **Auto:** engages incoming torpedoes and slugs on its own, nearest threat first. A toggle lets Auto also fire at enemy ships that come inside effective range.
  - **Manual:** fires only at what the player assigns (a ship, a specific torpedo, an object, or a point).
  - **Hold:** does not fire. Useful while running dark, since PDC fire is visible.
- Manual assignments can be mixed with Auto: for example, two PDCs on Auto covering the ship while two are manually assigned to shred an approaching corvette.
- Ammunition is finite and shown on the ship panel.

### Electronic warfare

Parked with Sensors Lite (2026-10-05); kept here for later.

- **Jamming** degrades enemy radar and lidar in a cone. Jammed tracks turn amber and their predicted path becomes a cone of possible trajectories instead of a single line.
- **Decoys** create ghost contacts that look like real ships to passive sensors until confirmed by lidar.
- When the player's own ship is jammed, the affected parts of the display visibly break down: lines dissolve into static and amber noise.

## 8. Sensors and stealth

Detection is the core of the game's tension. Every faction keeps its own picture of the battle. The player sees only their own.

### Sensors (Sensors Lite, owner, 2026-10-05)

The first M4 build (telescope, radar and lidar, uncertainty clouds, classification steps) was too complicated to play and was iceboxed. Sensors Lite keeps one decision: **see more, or stay hidden.**

- Each ship has one switch: **Sensors** on or off.
- A ship sees a contact when there is line of sight (bodies block it) and any one of these holds:

| Rule | Range | Notes |
|---|---|---|
| The contact is **loud** | Any range | Loud = drive burning, Sensors on, or fired a weapon in the last 10 s. Seen even by ships with their sensors off. |
| Proximity | 1,000 km | Anything this close is always seen. |
| The observer has **Sensors on** | 3,000 km | How dark ships and cold torpedoes are found. |

- **Seen means known.** A seen contact shows its class, name and weapon rings at once. There is no UNKNOWN step.
- Cold torpedoes follow the same rules as ships: coasting, they are dark; lit, they are loud.
- Starting numbers are tunable in the debug panel. Every map so far is inside 7,000 km, so "any range" and "a very long range" play the same.

### Line of sight

Planets, moons, and asteroids block all sensors. A ship hidden behind a moon cannot be seen, however loud it is.

### Running dark

- Dark = coasting, Sensors off, and not firing. A dark ship further than 1,000 km is invisible except to an enemy with Sensors on within 3,000 km.
- Heat builds while dark. A frigate can stay dark for about 10 minutes. It cools whenever the ship is loud (burning or Sensors on), so to cool down you must show yourself. At full heat the ship takes slow damage and shows HEAT CRITICAL.

### Lost contacts

- When nobody on your side sees a contact any more, it is lost: a hollow orange marker stays frozen where it was last seen, labelled `LAST SEEN mm:ss`, with one dashed line along its last course. There is no uncertainty cloud and no moving guess: where it went is your call.
- Weapons fired at a lost contact aim where its course line says it would be now.
- The marker fades after a few minutes unless someone sees the contact again.
- **Briefing:** a fight starts with each side knowing where every enemy ship was at the start, as a lost contact (built 2026-10-05). Without it a ship that stays dark could never be found, and nobody would know where to look.

### Datalink: the shared picture

Each ship builds its own local picture from its own sensors. Friendly ships connected by datalink merge their local pictures into one shared picture.

- A scout that spots an enemy hiding behind an asteroid sends that track to every linked ship. The whole group or fleet sees it, even ships with no line of sight.
- Every track remembers which ships are contributing to it. Hovering a track shows its sources: `SEEN BY: PICKET-2, FRIGATE-1`.
- **When the only ship seeing a contact is destroyed, the contact goes stale.** Its icon freezes at the last known position, turns orange and hollow, and a dashed line shows its last course. A label shows `LAST SEEN T+00:45 / PICKET-2 LOST`. If no other ship picks it up, the track fades out after a few minutes.
- The same happens if a contributing ship loses its link (out of range, blocked, or jammed) instead of being destroyed. The track returns if the link comes back.
- Triangulation: two or more linked ships with passive bearings on the same contact get its range immediately, without anyone emitting.
- The enemy has the same system. Killing their scouts blinds their fleet. Protecting your own pickets matters.

Starting assumption (to confirm in playtest): the datalink uses tight-beam lasers. A link needs line of sight between two ships but can relay through any friendly ship, and enemy jamming can cut it. This makes ship positioning matter for communication, not just for sensors. The simpler alternative is a link that always works within a set range.

### Tactics this should produce

The sensor model is tuned so these play out without scripting:
- Launch torpedoes cold from behind a moon, let them coast, light them late
- Turn Sensors on to catch cold torpedoes, and accept that you light yourself up
- Burn onto a new course, then go dark, so the enemy's last-seen line points the wrong way
- Evade (a slight bend) just before going dark, for the same reason
- Hunting the enemy's scouts first to blind their fleet
- Parking a picket behind an asteroid to watch a lane while the main force stays dark
- Firing torpedoes at a point where a stale track was last seen

## 9. Damage and crew

### Subsystems

No single hit-point bar. Each ship has:
- Hull integrity (loss = destroyed)
- Drive (damage caps acceleration)
- Reactor (damage reduces how many systems can run; breach = destroyed)
- PDC mounts, each with its own arc
- Torpedo tubes and magazine
- Railguns
- Sensors
- Radiators (damage shortens how long you can run dark)
- Crew

Hits land on subsystems based on the direction the hit came from relative to the ship's orientation. Facing matters.

### G-strain

- Each ship has a crew-safe acceleration (Cruise). Above it, a G-strain meter fills.
- High strain lowers crew efficiency: slower turns, worse PDC accuracy, slower damage control.
- Full strain causes casualties.
- Combat stims raise the limit for a time, followed by a period of reduced efficiency. Limited supply.

## 10. AI opponents

- AI ships use the same `Command` interface as the player and see only their own faction's sensor picture. No cheating.
- Starting approach: utility AI that scores a small set of behaviors (approach, keep range, launch salvo, go dark, hide behind body, evade, retreat) each second.
- Personality settings for variety: aggression, caution, emissions discipline.
- Built in M5 (`src/sim/ai/captain.ts`, numbers in `src/data/ai.ts`, all with debug sliders): once a second a captain scores station (close to its hold range and hold it), orient (swing so the railgun can bear), evade (burn across the line of torpedoes about to land), cover (put a body between itself and the enemy) and retreat (burn away; a ship that gets 10,000 km clear has escaped). Torpedo salvos and railgun fire run alongside, with group salvos timed to arrive together. PDCs stay on Auto. Personality moves every number: aggression sets how close it presses, salvo size and gap, and how late it retreats; caution sets how soon it evades, hides and retreats; emissions discipline sets how many salvos go cold and, with Sensors Lite (2026-10-05), how it uses sensors: below 0.35 it runs them all the time; above, only when it has seen no enemy for a while (searching), and from 0.6 it holds its range coasting dark instead of burning to match speed. Every captain shows itself to cool down when it is hot. With no enemy in sight it hunts: it flies to where its enemy was last known to be and searches there. Its evade behavior uses Evasive maneuvers. Presets: Hunter, Duelist, Skulker.
- Win and loss (M5, `src/sim/outcome.ts`): you lose when none of your ships is left; you win when no hostile ship is left (destroyed or escaped) and none of their torpedoes is still hunting; both gone at once is a draw. Time stops and a banner shows.
- Later: group and fleet AI for the player's own subordinates, driven by doctrine settings.

## 11. Career layer (after combat is proven)

- Persistent career. Your fleet is the save file.
- Mission board generated from templates: patrol, escort, intercept, ambush, reconnaissance, station defense.
- Rank grants larger commands (frigate, then group, then fleet).
- Ships persist with damage, ammunition, and crew experience. Repairs and refits between missions.
- Losses are permanent.

## 12. Visual language

### The holotable

- A 3D bounding box with faint glowing grids on the reference planes and labeled XYZ axes. This is the crew's frame of reference.
- An orbit camera around a focus point (usually the selected ship). Rotate, pan, logarithmic zoom, focus on selection, snap to top-down.
- Every object above or below the reference plane has a thin vertical drop line to the plane with a small foot marker. This is how depth stays readable while the camera moves.
- Icons stay a constant size on screen regardless of zoom.

### Symbology

| Object | Symbol | Color |
|---|---|---|
| Corvette | Single chevron | By allegiance |
| Frigate | Solid wedge (triangle) | By allegiance |
| Destroyer | Double chevron | By allegiance |
| Cruiser | Triple chevron | By allegiance |
| Capital ship | Triple chevron over a bar | By allegiance |
| Station | Tri-arm hub: ring hub, three arms, a module on each | By allegiance |
| Unknown contact | Dashed diamond with `?` | Orange |
| Lost contact (nobody sees it) | Last icon, frozen, hollow, `LAST SEEN mm:ss`, one dashed line along its last course | Orange |
| Targeted point in space | Small crosshair with drop line and weapon tag (`TORP x4`, `RG`, `PDC`) | Friendly |
| Torpedo | Small torpedo shape: pointed nose, tail fins, points along its flight (hostile ones pulse) | By allegiance |
| Torpedo intercept line and impact X | Thin dotted path along the torpedo's predicted flight, X and countdown | Weapon fire: green ours, yellow theirs |
| Railgun slug | Short streak, only when tracked | Weapon fire: green ours, yellow theirs |
| PDC fire | Tracer rounds (short streaks) over a faint line from gun to target | Weapon fire: green ours, yellow theirs |
| PDC coverage | Translucent dome or cone | By allegiance, low opacity |
| Celestial body | Dim wireframe sphere with name label | Neutral gray |
| Weapon range ring | Flat ring on the grid under the ship, one per weapon (torpedo, railgun, PDC), labelled | Own ships: friendly. Selected enemy: hostile. Lost enemy: orange, dashed |

Ship icons point along their thrust vector when burning. When coasting, they point along velocity.

Fill shows drive state for every allegiance: **filled = burning, hollow = coasting**, so the player can tell at a glance who is burning and who is dark, friend or foe.

Allegiance is shown by color plus a shape treatment, so it never depends on color alone: friendly icons have a plain outline, hostile icons add corner brackets, unknown icons are dashed.

Drop lines from objects below the reference plane are dashed; from objects above it, solid. The reference plane passes through the focused object (usually the player's ship), so above and below the plane means above and below you.

### Color tokens

| Token | Meaning | Starting value |
|---|---|---|
| `bg` | Background | `#05080C` |
| `grid` | Holotable grid and axes | `#1E4A5A` at low opacity |
| `friendly` | Player and own forces | `#39C6FF` |
| `neutral` | Neutral: independent ships and stations | White `#F2F5F7` |
| `hostile` | Enemy ships, locks, strike zones | `#FF3344` |
| `threat` | Danger text in the HUD panels (alerts, breaches, offline systems) | `#FF5A4A` |
| `fireFriendly` | Our weapons once fired: torpedoes in flight, PDC fire, intercept lines and impact marks, slugs, hit effects | Green `#3DF56B` |
| `fireHostile` | Enemy weapons once fired, the same items | Yellow `#FFE433` |
| `uncertainMap` | On the 3D table: unknown and jammed tracks, ghosts, probability cones, warnings | Orange `#FF7A1A` |
| `uncertain` | In the HUD panels: warnings and uncertain values | Amber `#FFB020` |
| `chrome` | Panel borders and UI frame | Desaturated steel `#7C93A0` |
| `text` | Labels and data | Off-white `#DCE6EA` |

Rule: red is never decorative. The reference images use a lot of red UI. We do not, because in this game a red pixel always means danger.

Weapon fire has its own colors, separate from allegiance (decided 2026-10-03): once a weapon is fired, what it puts in the air is green if it is ours and yellow if it is the enemy's. Torpedoes in flight count as fired weapons (decided 2026-10-04), so their symbols and drop lines take these colors too. Ships keep allegiance colors. Uncertain or warning is orange on the table and amber in the panels, so neither is mistaken for enemy fire.

### Line language

| Line | Meaning |
|---|---|
| Solid bright arc | Predicted path while burning |
| Dashed arc | Predicted path while coasting |
| Rotating-arrows glyph + countdown | Flip point |
| Ring + ETA | Arrival point |
| Thin dotted converging lines + X + countdown (yellow incoming, green ours) | Torpedo predicted path and impact |
| Orange dashed line from a hollow icon | Last course of a lost contact |
| Faint dotted line between friendly ships | Datalink connection (breaks visibly when cut) |

### Effects

- Bloom on lines and icons so they glow
- A slight chromatic split on holographic lines (seen in the reference holograms)
- Subtle flicker when the ship is hit: the table stutters (color split, torn bands, scanlines), harder for heavier hits (M6)
- Alert strip: new alerts flash in, danger alerts pulse, the strip flashes red on new danger (M6)
- Static, noise, and line dissolve when jammed

Readability comes first. Every effect has an intensity slider in the debug panel and an accessibility setting to reduce it.

### HUD layout

- **Center:** the holotable
- **Left rail:** own ship status: nav state, subsystems, heat, G-strain, emissions state
- **Right rail:** the alert log (owner, 2026-10-04): every launch, hit, kill, loss and system failure with the time it happened, newest first; similar lines in quick succession merge ("8 torpedoes destroyed"). A contact list was dropped with Sensors Lite (2026-10-05); contacts gained and lost go in the alert log.
- **Bottom deck** (owner, M6): three panels after the UX references. **Weapons control** (left): a bracketed station per weapon (torpedoes, railgun, point defense), each a big square action tile beside a small key grid for its settings, with a gauge (tick ruler over a filled bar: magazine, railgun charge, PDC rounds). **Time** (middle): a tick ruler with a pointer at the compression, the clock, slower / pause / faster. **Helm** (right): order tiles whose status line lights while the order runs, thrust as slanted tabs, a Sensors tile that says what gives you away. Weapons and helm are the same height. Every panel has a title band and tick ruler.
- **Top strip:** alerts such as `LAUNCH DETECTED`, `ENEMY SENSORS ACTIVE`, `IMPACT T-00:42`

Panels have chamfered corners, thin borders, condensed uppercase labels, and dense data rows (`DRIVE OK`, `PDC 3 AMMO 62%`), following the system control and airlock panel references.

### Type

- Labels and headers: **Oxanium**, uppercase, letter-spaced
- Numbers and data: **Share Tech Mono**

Both are free (SIL Open Font License) on Google Fonts.

### Accessibility

- Allegiance is coded by shape as well as color
- Color-blind palette option (M6): Standard, Red-green safe, Blue-yellow safe. Same meanings, other shades (in red-green safe, hostile leans pink); checked by a test that simulates each kind of color blindness. On the player's Settings screen
- Effect intensity sliders (debug panel), and a single Reduce effects switch for players (M6)
- Remappable keys (M6): every shortcut in Settings, Controls; a key already in use swaps
- Pause is always available, and auto-slowdown options make the game playable at any reaction speed

## 13. What we take from the references

| Reference | What we use |
|---|---|
| Navigation panel (`rhys-yorke-ex-rocinante-09`) | Polar range rings over a grid, a single hot trajectory arc, dashed orbital paths, tiny icon clusters with small labels, dense data side rails |
| Curved helm display (`Hp5shGx`) | Targeting brackets, tick-mark scales on frame edges, radar inset |
| System control interface (`rhys-yorke-ex-rocinante-05`) | Panel layout, status rows with OK/NA states, amber alert boxes, terminal-style log panels |
| Airlock panels (`4v7b4NJ`, `Vho0lAu`) | Chamfered frames, large clear state buttons, horizontal gauge bars with tick scales |
| Holographic displays | Thin luminous orbit lines with chromatic split, objects floating in a dark volume |

## 14. Starting numbers

All values are tuned in playtest through the debug panel. 1 g = 9.81 m/s².

### Ship classes

| Class | Role | Cruise G | Combat G | Max G | Flip time | PDCs | Tubes / magazine | Railguns |
|---|---|---|---|---|---|---|---|---|
| Corvette | Scout, picket | 3 | 5.5 | 8 | 8 s | 2 | 2 / 8 | None |
| Frigate (player start) | Multirole | 2 | 4 | 6 | 12 s | 4 | 2 / 12 | Light railgun |
| Destroyer | Escort, PDC screen | 2 | 3.5 | 5 | 18 s | 8 | 4 / 16 | Light railgun |
| Cruiser | Line ship | 1.5 | 2.75 | 4 | 30 s | 10 | 6 / 30 | Spinal railgun |
| Capital | Flagship | 1 | 2 | 3 | 45 s | 16 | 8 / 48 | 2 spinal railguns |

Combat G starts halfway between Cruise and Max.

### Reference timings

- Frigate burn-to-point over 5,000 km at 2 g: about 17 minutes sim time (about 1 minute real at 16x)
- Same trip at 6 g: about 10 minutes sim time, with heavy G-strain
- Frigate over 300,000 km at 2 g: about 2.2 hours sim time (about 8 seconds real at 1024x)
- Torpedo over 5,000 km: about 6 minutes, mostly coasting after the burn

## 15. Open questions

Decide these when the relevant milestone arrives. None of them block the combat core.

1. **Setting and factions.** Original names, history, and the reason these sides are fighting. Needed before the career layer.
2. **Captain death.** In the career, what happens when the player's own ship is destroyed? Options: escape pod and demotion, or career ends.
3. **Gravity in battle.** Decided in M2: on. Bodies stay on fixed positions but pull on everything that moves. Still open: moving bodies (moons on their own orbits) and slingshot planning.
4. **Power management.** Should the player route reactor power between drive, weapons, sensors, and jamming? Adds depth and complexity.
5. **Audio direction.** Alarms, PDC fire, drive rumble, comms chatter.
6. **Datalink model.** Line-of-sight laser links with relay (current assumption) or simple range-based links.
7. **Input.** Assumed desktop browser with mouse and keyboard. Touch and controller are out of scope for now.
