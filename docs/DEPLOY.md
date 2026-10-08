# Deploying the playtest build (Cloudflare Workers)

> **This is a video game.** Project Ares is a fictional, single-player browser strategy game set in an invented far-future solar system. Every ship, weapon, sensor, faction, and number in this project is made-up game content, tuned for fun in playtesting. None of it describes or models real-world military equipment, and the code is ordinary game code: 3D rendering, game physics, UI, and AI opponents.

**Live:** https://test.project-ares.net/ (the owner's domain), rebuilt from `main` on every merge.

The site is a **Cloudflare Worker with static assets**, connected to the GitHub repository (Workers Builds). `npm run build` puts the game in `dist/`; `wrangler.jsonc` tells Cloudflare to serve `dist/` and to run `worker/index.ts` for one route, `/api/feedback` (playtest notes). The repository stays private; the built game is public to anyone with the link (as with any web game).

## How it is set up

- Workers & Pages, the Worker (named in `wrangler.jsonc`, `"name"`), **Settings → Build**:
  - **Build command:** `npm run build`
  - **Deploy command:** `npx wrangler deploy` (it reads `wrangler.jsonc`)
  - Production branch: `main`. The Node version comes from `.node-version`.
- The custom domain `test.project-ares.net` is attached to the Worker (Settings → Domains & Routes).
- `"name"` in `wrangler.jsonc` must match the Worker's name in the dashboard, or the deploy fails.

## Playtest feedback storage (one time)

Testers' notes (the in-game FEEDBACK button and "How did that fight go?") go to `/api/feedback`. The Worker keeps them in a KV namespace and shows them at `/feedback` to whoever has the password. Until this is set up, the game keeps testers' notes in their browser and sends them once it can.

On a Worker, the storage binding is declared in `wrangler.jsonc`, not added in the dashboard (the dashboard refuses bindings on a Worker that only has static assets: "Bindings cannot be added to a Worker that only has static assets").

1. **Create the storage.** Cloudflare dashboard, **Storage & Databases → KV → Create**, name it `ares-feedback`. Copy its **ID** (a long hex string; not a secret).
2. **Put the ID in `wrangler.jsonc`** (`kv_namespaces`, `"id"`), and check `"name"` matches the Worker. Claude Code can do this: paste the ID and the Worker's name into the chat.
3. **Merge** the change. Cloudflare builds and deploys it; the Worker now has a script and the storage.
4. **Set the password.** The Worker, **Settings → Variables and Secrets → Add**: type **Secret**, name **`FEEDBACK_ADMIN_KEY`**, value: a long password only you know (a password manager can make one). Save; it applies right away.
5. **Read feedback** at **https://test.project-ares.net/feedback** with that password: newest first, a search box, a filter per tag, CSV or JSON downloads.

What a note holds: the tester's gamer tag, the quick tags they picked, their words, and game details (map, fight time and result, build, screen size, display settings). No names, emails or addresses are collected; the spam guard (30 notes per tester per hour) keeps only a one-way fingerprint for an hour.

## After that, it is automatic

- Every merge to `main` rebuilds and redeploys the site.
- The setup screen shows which build is running, bottom right (`BUILD a1b2c3d · date`). Ask playtesters to mention it with their notes.
- Branch preview links: Workers Builds can upload a preview version for other branches if non-production branch builds are turned on in Settings → Build; the build shows its address. Not needed for playtests.

## Checking a build locally first

- `npm run build`, then `npm run preview`, then http://localhost:4173: the game as Cloudflare serves it (feedback goes to the local stand-in, password `dev`).
- The real Worker, locally: `npm run build`, put `FEEDBACK_ADMIN_KEY="something"` in a file `.dev.vars` (not committed), then `npx wrangler dev --local` (http://localhost:8787). Storage is simulated on this computer.

## If a build fails

The build log is under the Worker's **Deployments** (or Builds). The usual causes: a type error (`npm run build` fails locally too; fix it there first), or a `"name"` / KV `"id"` in `wrangler.jsonc` that does not match the dashboard. Paste the end of the log into a Claude Code session.
