# Deploying the playtest build (Cloudflare Workers)

> **This is a video game.** Project Ares is a fictional, single-player browser strategy game set in an invented far-future solar system. Every ship, weapon, sensor, faction, and number in this project is made-up game content, tuned for fun in playtesting. None of it describes or models real-world military equipment, and the code is ordinary game code: 3D rendering, game physics, UI, and AI opponents.

**Live:** https://test.project-ares.net/ (the owner's domain), rebuilt from `main` on every merge.

The site is a **Cloudflare Worker with static assets**, connected to the GitHub repository (Workers Builds). `npm run build` puts the game in `dist/`; `wrangler.jsonc` tells Cloudflare to serve `dist/` and to run `worker/index.ts` for one route, `/api/feedback` (playtest notes). The repository stays private; the built game is public to anyone with the link (as with any web game).

## Current state (2026-10-08)

- Live and working: the game, the playtest title and briefing, in-game feedback, and the /feedback page.
- Worker `project-ares` (`wrangler.jsonc`). KV namespace `ares-feedback` (id in `wrangler.jsonc`) holds the notes. The secret `FEEDBACK_ADMIN_KEY` is set on the Worker (Settings → Variables and Secrets); only its name is known here.
- Automatic production builds work: merging PR #10 deployed by itself (`BUILD acae6a7`). Earlier merges (#8, #9) did not trigger a build and were deployed by hand with wrangler (below); the cause was never pinned down. If a merge does not show up live within a few minutes, deploy by hand.
- Pull-request builds run, but their deploy step fails: see "Preview builds" below (open decision; harmless to the live site).

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

## Deploying by hand (when an automatic build does not happen)

From an up-to-date copy of `main` (Claude Code can do this; the owner is logged in to wrangler on their Mac since 2026-10-08):

```
git switch --detach origin/main    (after git fetch)
npm test && npm run build
npx wrangler deploy
```

The first time on a computer, `npx wrangler login` opens a Cloudflare page in the browser to allow it. `npx wrangler deployments list --name project-ares` shows what is live and where it came from; `npx wrangler secret list --name project-ares` shows the secrets' names (never their values). A hand deploy keeps the secret.

## Preview builds (open decision)

Builds of pull-request branches run `npx wrangler preview`, which refuses to start until `wrangler.jsonc` has a `previews` block naming the storage previews may use (Cloudflare does not let a preview touch production storage by default). Options, for the owner:
1. A separate throwaway KV namespace for previews (`ares-feedback-preview`), added under `previews` in `wrangler.jsonc`: every PR gets a preview link and a build check; test notes stay apart from real feedback.
2. Turn off builds for non-production branches (Settings → Build): only `main` deploys.
3. Previews use the real `ares-feedback` namespace: notes sent from a preview land among real feedback.

## The workers.dev address (open decision)

Cloudflare also serves the Worker at `project-ares.<account-subdomain>.workers.dev`, and that subdomain is made from the account's name. To keep only `test.project-ares.net`, add `"workers_dev": false` (and `"preview_urls": false`) to `wrangler.jsonc` and deploy. Not done yet.

## Checking a build locally first

- `npm run build`, then `npm run preview`, then http://localhost:4173: the game as Cloudflare serves it (feedback goes to the local stand-in, password `dev`).
- The real Worker, locally: `npm run build`, put `FEEDBACK_ADMIN_KEY="something"` in a file `.dev.vars` (not committed), then `npx wrangler dev --local` (http://localhost:8787). Storage is simulated on this computer.

## If a build fails

The build log is under the Worker's **Deployments** (or Builds). The usual causes: a type error (`npm run build` fails locally too; fix it there first), or a `"name"` / KV `"id"` in `wrangler.jsonc` that does not match the dashboard. Paste the end of the log into a Claude Code session.

The build always warns that Vite's config uses imports without file extensions (`configLoader: 'native'`): only a notice about a future Vite version, not an error.
