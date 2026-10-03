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
