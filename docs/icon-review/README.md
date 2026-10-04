# Icon review, 2026-10-04

A review of the game's table symbols, done icon by icon on a review sheet.

- **[icon-sheet.html](icon-sheet.html)** is a snapshot of that sheet as it stood at the end of the review. Open it in a browser. It shows every symbol exactly as the game draws it: each state, the size the player sees, the colors, and two in-game screenshots.
- The live review page was a private claude.ai page with Keep / Revise / Cut buttons and comments on each icon. The comments are summarized below, because they are not stored in the repo.
- To rebuild the snapshot after changing an icon: `npm run icons -- --standalone`. The sheet is drawn from the game's own icon code (`src/render/symbolAtlas.ts`), so it stays accurate. The two in-game screenshots come from `shots/` (not in git); make them first with `npm run shot -- --query "scenario=holotable-test&paused=1" --out sheet-holotable` and `npm run shot -- --query "scenario=first-fight" --out sheet-firstfight`, or that part of the sheet is left out.

## What was decided

| Symbol | Change | Commits |
|---|---|---|
| Cruiser | Elongated diamond became a triple chevron: the destroyer's, plus a third. | `ed68782` |
| Capital ship | Large diamond with a bar became three chevrons over a bar. Wider and flatter than the cruiser's so it fits inside the hostile brackets. | `7246995` |
| Station | Square became a wheel, then a wheel with a smaller hub, a heavier rim and thinner spokes, then three alternatives were mocked up in the game. The owner chose the **tri-arm hub** (ring hub, three arms, a module on each). Size 30 to 44 px. | `7246995` `233f19e` `cda1d58` `a871330` |
| Torpedo | Dot became a torpedo shape: slim body, pointed nose, tail fins, pointing along its flight. Size 20 to 24 px. | `c4ecec8` |

Station options that were not chosen: ring on an axle, and truss with solar panels. Two more were tried and dropped before the owner saw them: a banded drum (it read as a gas canister) and a plus-shaped cross of modules (it looked like the placed-point crosshair).

`docs/DESIGN.md` was updated for all four symbols.

## Not reviewed yet

Corvette, frigate, destroyer, unknown contact, selection reticle, body marker, flip marker, arrival ring, thrust line, placed point, impact mark, and the drop line with its foot ring. They have no verdict and no comments, so they are unchanged.

## Observations that nobody acted on

- Line weight scales with the icon: 1.1 px on the torpedo up to 2.3 px on the capital ship.
- A selected hostile ship shows two nested sets of corner brackets, about 3 px apart.
- The atlas still draws dashed versions of every ship class that nothing uses today. They would matter for stale contacts, and the dashes break up on the small chevrons.
- The tri-arm hub reads lighter than the wheel next to the ships. Its size is the "size: station" slider in the debug panel.
- The HUD has no icons (buttons are text). Route lines, range rings, PDC tracers and the holotable frame are line work and were not part of this review.
