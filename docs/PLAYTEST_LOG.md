# Playtest Log

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

## 2026-10-03, milestone M3 (in progress): second session handoff
Done and committed:
- Routing bug fixed (commit 2aa91d1). Routes leaving an orbit or a parked spot go around moons and asteroids. Detours follow the body's edge and take the side the ship is already moving toward. A last-moment safety layer swerves the ship at full thrust if its real motion would carry it into a body; the nav readout shows AVOID while that happens. Tests: `tests/routingDeparture.test.ts`.
- M3 step 2, torpedoes in the sim (`src/sim/weapons/torpedo.ts`, `tests/torpedo.test.ts`): launch order and tubes firing in waves, hot and cold launch, guidance (boost onto a collision course leading the target's acceleration, dark coast, firm mid-course corrections only when needed, final homing on the reserve), seeker, mines at a point, proximity fuse (never on friendlies), hit direction. Torpedo numbers are in the debug panel under "Torpedoes".
- Hit-or-miss table, one torpedo against a ship burning flat out across the line of fire for the whole flight (the hardest dodge):

  | Range | Cruise 2 g | Combat 4 g | Max 6 g |
  |---|---|---|---|
  | 500 to 2,000 km | hit | hit | hit |
  | 3,000 km | hit | hit | escapes |
  | 5,000 km | hit | escapes | escapes |

  Escaping means burning hard for 5 minutes or more, which G-strain (step 6) will make costly.
- Torpedoes cannot be fired from the game yet; that is step 3.
Auto mode blocked commands partway through both sessions today. If it happens again, switch to the default permission mode.
Next session: step 3 (torpedo targeting UI, intercept lines with impact X and countdown, launch alert).

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
