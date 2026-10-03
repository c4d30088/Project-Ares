# Project Ares: Game Design

Status: draft v0.1, combat-first. Numbers in this document are starting values for playtesting, not final balance.

## 1. Pitch

You command warships in a hard-ish Newtonian solar system, seen through a holographic tactical table. You never see a ship model. You see wedges, chevrons, glowing trajectory arcs, swarms of red dots, and the translucent domes of point defense. Combat is about where things are going, what you can see, and what can see you.

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
| Torpedo exchange | 1,000 to 50,000 km | Radar and lidar, salvos, jamming, intercept lines | 4x to 64x |
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
| Evade | Randomized jinking burns. Spoils enemy firing solutions, costs G-strain and makes you bright. |
| Coast | Drive off. Required for running dark. |
| Orient | Point the bow along a direction or at a target, for railgun shots, PDC arcs, or minimum cross-section. |
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
- Launch modes: **Hot** (drive lights at launch, fast and visible) or **Cold** (ejected and coasting, drive lights late, hard to detect).
- Salvo size and spread are player choices. Small salvos are easy to stop. Large salvos empty the magazine.
- A salvo can be split across several targets or points.
- When torpedoes are in flight, the table draws thin converging lines from each one to the predicted impact point, marked with an X and a countdown.
- Hostile torpedoes are bright red dots. A swarm closing on one blue wedge is the signature image of the game.

### Railguns

- Kinetic guns firing a slug at about 20 km/s. Frigates and destroyers carry a light railgun on a limited turret. Cruisers and capital ships carry heavy spinal railguns fixed along the keel, so the whole ship must turn to aim.
- A lidar lock gives the best firing solution and shows the lead point on the table. Without a lock, you can still fire at a track's estimated position or at a point, with lower accuracy.
- Slugs are hard to see coming: they have no drive plume, and the target only gets warning if its radar picks them up.
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

- **Jamming** degrades enemy radar and lidar in a cone. Jammed tracks turn amber and their predicted path becomes a cone of possible trajectories instead of a single line.
- **Decoys** create ghost contacts that look like real ships to passive sensors until confirmed by lidar.
- When the player's own ship is jammed, the affected parts of the display visibly break down: lines dissolve into static and amber noise.

## 8. Sensors and stealth

Detection is the core of the game's tension. Every faction keeps its own picture of the battle. The player sees only their own.

### Sensors

| Sensor | Type | Gives | Starting range | Cost |
|---|---|---|---|---|
| Telescope (optical and IR) | Passive | Bearing. Range estimate improves over time, or immediately with triangulation from two or more ships. | Burning drive: 2,000,000 km. Dark ship: 3,000 km. Cold torpedo: 300 km. | None. Always on. |
| Radar | Active, wide | Range, bearing, velocity | 100,000 km against a frigate. 10,000 km against a coasting torpedo. | Your emitter is visible to enemy passive sensors at twice your radar range. |
| Lidar | Active, narrow beam | Targeting-quality lock: best railgun solutions and best torpedo guidance | 30,000 km | The target gets a lock warning. |

### Signatures

- **Drive plume.** By far the brightest thing. Scales with G. Under thrust you are visible across the system.
- **Heat.** Reactor and crew heat. Grows while dark (see below).
- **Radar cross-section.** Depends on size and aspect. Pointing your bow at a radar shrinks it.
- **Emissions.** Your own radar, lidar, and jammers.

### Line of sight

Planets, moons, and asteroids block all sensors. The table draws faint sensor shadow volumes behind bodies relative to known enemy sensor positions, so the player can see where they would be hidden.

### Running dark

- Coast with drive off and active sensors off.
- Heat builds because radiators are retracted. A frigate can stay dark for about 10 minutes at reactor idle.
- Venting heat (extending radiators) makes you visible to IR for a short time. Overheating damages systems and crew.

### Tracks

- Each contact is a track with a position estimate, an uncertainty region, and a classification confidence.
- Uncertainty grows while a contact is not being detected and shrinks with each detection.
- Classification improves with better data: `UNKNOWN` to `DRIVE SIG: FRIGATE-CLASS` to a confirmed identity.

### Datalink: the shared picture

Each ship builds its own local picture from its own sensors. Friendly ships connected by datalink merge their local pictures into one shared picture.

- A scout that spots an enemy hiding behind an asteroid sends that track to every linked ship. The whole group or fleet sees it, even ships with no line of sight.
- Every track remembers which ships are contributing to it. Hovering a track shows its sources: `SEEN BY: PICKET-2, FRIGATE-1`.
- **When the only ship seeing a contact is destroyed, the contact goes stale.** Its icon freezes at the last known position, turns amber, and its uncertainty region starts growing. A label shows `LAST SEEN T+00:45 / PICKET-2 LOST`. If no other ship picks it up, the track fades out after a few minutes.
- The same happens if a contributing ship loses its link (out of range, blocked, or jammed) instead of being destroyed. The track returns if the link comes back.
- Triangulation: two or more linked ships with passive bearings on the same contact get its range immediately, without anyone emitting.
- The enemy has the same system. Killing their scouts blinds their fleet. Protecting your own pickets matters.

Starting assumption (to confirm in playtest): the datalink uses tight-beam lasers. A link needs line of sight between two ships but can relay through any friendly ship, and enemy jamming can cut it. This makes ship positioning matter for communication, not just for sensors. The simpler alternative is a link that always works within a set range.

### Tactics this should produce

The sensor model is tuned so these play out without scripting:
- Launch torpedoes cold from behind a moon, let them coast, light them late
- Run radar to catch cold torpedoes, and accept that you light yourself up
- Two ships triangulating a passive contact to get range without emitting
- Decoys drawing a salvo away from the real ship
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
- Sensors (telescope, radar, lidar)
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
| Cruiser | Elongated diamond | By allegiance |
| Capital ship | Large diamond with center bar | By allegiance |
| Station | Square | By allegiance |
| Unknown contact | Dashed diamond with `?` | Amber |
| Stale contact (source lost) | Last icon, frozen, hollow, with growing uncertainty ring | Amber |
| Targeted point in space | Small crosshair with drop line and weapon tag (`TORP x4`, `RG`, `PDC`) | Friendly |
| Torpedo | Small dot (hostile dots pulse) | By allegiance |
| Railgun slug | Short streak, only when tracked | By allegiance |
| PDC coverage | Translucent dome or cone | By allegiance, low opacity |
| Celestial body | Dim wireframe sphere with name label | Neutral gray |
| Sensor shadow | Faint dark volume behind a body | Neutral gray |

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
| `neutral` | Neutral and allied | `#4BE39A` |
| `hostile` | Enemy ships, locks, strike zones | `#FF3344` |
| `threat` | Incoming munitions | `#FF5A4A`, pulsing |
| `uncertain` | Jammed tracks, ghosts, probability cones, warnings | `#FFB020` |
| `chrome` | Panel borders and UI frame | Desaturated steel `#7C93A0` |
| `text` | Labels and data | Off-white `#DCE6EA` |

Rule: red is never decorative. The reference images use a lot of red UI. We do not, because in this game a red pixel always means danger.

### Line language

| Line | Meaning |
|---|---|
| Solid bright arc | Predicted path while burning |
| Dashed arc | Predicted path while coasting |
| Rotating-arrows glyph + countdown | Flip point |
| Ring + ETA | Arrival point |
| Thin converging red lines + X + countdown | Torpedo intercept and predicted impact |
| Amber fan of lines | Possible trajectories of an uncertain or jammed track |
| Amber particle cloud | Uncertain position |
| Thin pulsing line between ships | Lidar lock (red when someone locks you) |
| Faint dotted line between friendly ships | Datalink connection (breaks visibly when cut) |

### Effects

- Bloom on lines and icons so they glow
- A slight chromatic split on holographic lines (seen in the reference holograms)
- Subtle flicker when the ship is hit
- Static, noise, and line dissolve when jammed

Readability comes first. Every effect has an intensity slider in the debug panel and an accessibility setting to reduce it.

### HUD layout

- **Center:** the holotable
- **Left rail:** own ship status: subsystems, ammunition, heat, G-strain, emissions state
- **Right rail:** contact list: class, confidence, range, closing rate, time to closest approach
- **Bottom bar:** order buttons, G setting, time compression controls
- **Top strip:** alerts such as `LAUNCH DETECTED`, `LIDAR LOCK`, `IMPACT T-00:42`

Panels have chamfered corners, thin borders, condensed uppercase labels, and dense data rows (`DRIVE OK`, `PDC 3 AMMO 62%`), following the system control and airlock panel references.

### Type

- Labels and headers: **Oxanium**, uppercase, letter-spaced
- Numbers and data: **Share Tech Mono**

Both are free (SIL Open Font License) on Google Fonts.

### Accessibility

- Allegiance is coded by shape as well as color
- Color-blind palette option
- Effect intensity sliders
- Remappable keys
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
