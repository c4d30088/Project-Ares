# Project Ares: Technical Architecture

> **This is a video game.** Project Ares is a fictional, single-player browser strategy game set in an invented far-future solar system. Every ship, weapon, sensor, faction, and number in this project is made-up game content, tuned for fun in playtesting. None of it describes or models real-world military equipment, and the code is ordinary game code: 3D rendering, game physics, UI, and AI opponents.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript | Type errors caught before the game runs. Claude Code works well with it. |
| Build tool | Vite | Fast dev server with instant reload. |
| 3D | three.js (plain, not react-three-fiber) | Mature WebGL library. Direct control of the render loop, instancing, lines, and post-processing. |
| HUD panels | React | Side rails, contact lists, and order bars are ordinary UI. React handles that; three.js handles the table. |
| Tests | Vitest | Unit tests for physics, guidance, and sensors. |
| Visual checks | Playwright (headless Chromium) | Claude Code takes screenshots of the running game and inspects them itself. |
| Tuning | lil-gui | A slider panel for every tunable number, so the owner can tune feel without touching code. |
| Version control | git, with a private GitHub repo | Every working step is a commit you can return to. |
| Playtest builds | GitHub Pages or Netlify | A link you can send to friends. |

## Folder layout

```
Project Ares/
  CLAUDE.md
  docs/                  design, architecture, roadmap, playtest log
  src/
    sim/                 pure simulation. No three.js, no React, no DOM.
      world.ts           entity storage, tick
      rng.ts             seeded random number generator
      commands.ts        Command types and validation
      physics.ts         integration, attitude
      autopilot.ts       nav computer orders
      predict.ts         ghost-run prediction
      weapons/           torpedoes, pdc, railgun
      sensors/           signatures, detection, line of sight, tracks, jamming
      damage.ts          subsystems, hit location
      crew.ts            G-strain, heat
      ai/                utility AI
    render/              three.js. Reads snapshots, never sim internals.
      palette.ts         color tokens
      holotable.ts       bounding box, grids, axes
      camera.ts          orbit camera, log zoom, floating origin
      icons.ts           instanced symbol sprites
      lines.ts           trajectories, intercepts, drop lines
      volumes.ts         PDC domes, sensor shadows, uncertainty clouds
      effects.ts         bloom, chromatic split, jamming static
    ui/                  React HUD panels
    game/                main loop, input, sim-to-render bridge
    data/                ship classes, weapons, sensors, scenarios (all tunables)
  tests/                 Vitest tests for src/sim
  scripts/               screenshot script and other tools
```

## Core patterns

### 1. Simulation is separate from presentation

`src/sim` is a pure, headless module. It takes commands and advances time. It knows nothing about the screen. This gives us:
- Unit tests without a browser
- After-action replays (store the starting state and the command list, re-run)
- AI that runs on the same rules as the player
- A future multiplayer server that runs the same sim code in Node

### 2. Fixed timestep

- The sim ticks at 20 Hz (50 ms of sim time per tick).
- Time compression runs more ticks per real frame, not bigger ticks.
- The renderer interpolates between the last two sim states for smooth motion at 60 fps.
- Sensor sweeps run once per second of sim time, not every tick.
- If the sim would take more than 8 ms in one frame, the game lowers time compression automatically and shows why.

### 3. Commands in, snapshots out

- Player input and AI decisions both become `Command` objects (for example `{ type: "burnTo", ship, point, g: "combat" }`) stamped with the tick they apply on.
- Each tick the sim publishes a `Snapshot` for each faction: that faction's sensor picture plus its own ships' full state.
- The renderer and HUD read only the player faction's snapshot.

### 4. Sensor picture from day one

Even before sensors exist (milestones M1 to M3), the renderer reads from a `SensorPicture` interface. At first that interface returns perfect information. When M4 arrives, the implementation changes and nothing in the renderer has to be rewritten. The debug panel has a "God view" toggle that shows ground truth.

The picture is built in two layers, even when the player has only one ship:

1. **Local picture, per ship.** What that ship's own sensors detect.
2. **Shared picture, per datalinked network.** The merge of every local picture in a connected network of friendly ships. Each track keeps a list of contributing ships and the time each last updated it.

When a contributor is destroyed or loses its link, it is removed from that track's contributor list. A track with no remaining contributors becomes stale: frozen at its last estimate, uncertainty growing with time, then dropped. Building this structure from M4 means the fleet datalink in Phase 2 is a matter of connecting networks, not rewriting sensors.

### 4b. Targets are one type

Every weapon command takes a `Target`, which is one of: a track ID, an object ID (body, asteroid, station), or a point in space. Torpedoes, railguns, and PDCs all accept all three. Only PDCs have an `auto` mode, which picks targets from the ship's own picture.

### 5. Prediction by ghost run

Predicted paths, flip points, and intercept points are produced by copying the relevant entities and running the real autopilot and guidance code forward in a background step. This keeps prediction and reality in agreement. Predictions refresh a few times per second, not every frame.

### 6. Data-driven tuning

Every number in `docs/DESIGN.md` section 14 lives in `src/data`. The lil-gui panel edits them live. A "copy values" button exports the current tuning so it can be pasted back into the data files.

### 7. Scenarios as data

Test fights are JSON files in `src/data/scenarios`: bodies, ships, factions, starting positions and velocities, and AI settings. A scenario picker on the start screen loads them. This is how we build repeatable playtests.

## Handling huge distances

Distances run from meters (PDC fire) to hundreds of millions of meters (planets). GPUs use 32-bit floats, which lose precision at large values and make things jitter.

- The sim uses JavaScript numbers (64-bit) in meters.
- The renderer uses a floating origin: every frame, positions are converted to be relative to the camera's focus point before they reach the GPU.
- The renderer enables three.js's logarithmic depth buffer so near and far objects both sort correctly.
- Camera zoom is logarithmic.

## Rendering techniques

- **Icons:** one instanced mesh per symbol type, drawn as camera-facing sprites at constant screen size and rotated to the projected thrust direction.
- **Lines:** three.js `Line2` (thick lines) for trajectories and intercepts, with a dash shader for coasting segments.
- **Glow:** `UnrealBloomPass` post-processing, plus a small custom pass for chromatic split.
- **Volumes:** PDC domes and sensor shadows as transparent meshes with a fresnel edge glow. Uncertainty clouds as point sprites.
- **Jamming:** a screen-space noise shader masked to the affected region, plus line dissolve on affected tracks.

## Performance budget

- 60 fps on a mid-range laptop with integrated graphics
- Per frame: sim under 8 ms, render under 6 ms
- Target scale for the combat core: 10 ships, 100 torpedoes in flight, 10 bodies
- Target scale for the fleet tier: 40 ships, 400 torpedoes. May require moving the sim to a Web Worker. The separation in pattern 1 makes that a contained change.

## Testing

- **Vitest unit tests** for everything in `src/sim` with math in it:
  - Burn-to-point arrives within tolerance at near-zero velocity, with the flip near the midpoint
  - Intercept and impact prediction match the actual impact within tolerance
  - PDC saturation: N guns against M torpedoes gives expected leak-through over many seeded runs
  - Detection ranges match the design table
  - Line of sight is blocked by bodies
  - Same seed and same commands give an identical end state (determinism)
- **Playwright screenshot script** (`npm run shot`): loads a scenario, waits, saves a PNG. Claude Code uses it to check its own visual work.

## Saving (career layer, later)

- Career state is JSON in browser storage, with export and import to a file as a backup.
- Battles are not saved mid-fight at first. Revisit if playtesters ask for it.

## Multiplayer (later)

- Plan for server-authoritative play: the server runs the same headless sim in Node and sends each player their own faction's snapshot. This also prevents cheating, since clients never receive hidden information.
- Pure lockstep across browsers is risky because trig functions can differ slightly between browser engines. Server-authoritative avoids that.
- Nothing multiplayer is built until single-player combat is fun.
