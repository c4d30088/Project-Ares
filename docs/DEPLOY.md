# Deploying the playtest build (Cloudflare Pages)

> **This is a video game.** Project Ares is a fictional, single-player browser strategy game set in an invented far-future solar system. Every ship, weapon, sensor, faction, and number in this project is made-up game content, tuned for fun in playtesting. None of it describes or models real-world military equipment, and the code is ordinary game code: 3D rendering, game physics, UI, and AI opponents.

The game is a static website: `npm run build` puts everything in `dist/`. Cloudflare Pages builds it from the GitHub repository and serves it at a free `*.pages.dev` address. The repository stays private; the built game is public to anyone with the link (as with any web game).

## One-time setup (the owner, about 10 minutes)

1. Create a free account at **dash.cloudflare.com** (or sign in).
2. In the dashboard, open **Workers & Pages** and choose **Create**, then the **Pages** tab, then **Connect to Git** (sometimes labelled "Import an existing Git repository"). If the dashboard steers you to "Workers", look for the link to Pages.
3. Choose **GitHub** and approve the Cloudflare app. When GitHub asks which repositories, pick **Only select repositories** and choose **Project-Ares**.
4. Pick the **Project-Ares** repository and set up the build:
   - **Project name:** for example `project-ares`. It becomes the address, `project-ares.pages.dev` (if taken, Cloudflare suggests another).
   - **Production branch:** `main`.
   - **Framework preset:** None (or Vite, if listed).
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Leave the rest as it is. The Node version comes from `.node-version` in the repository.
5. **Save and Deploy.** The first build takes a few minutes. When it is green, the address opens the skirmish setup screen.

**Live (2026-10-07):** https://test.project-ares.net/ (the owner's domain, serving `main`).

## After that, it is automatic

- Every merge to `main` rebuilds the main address (`project-ares.pages.dev`).
- Every other branch pushed to GitHub gets its own preview address, for example `claude-m6-feel-polish.project-ares.pages.dev`, so a milestone can be playtested before it is merged.
- The setup screen shows which build is running, bottom right (`BUILD a1b2c3d · date`). Ask playtesters to mention it with their notes.

## Checking a build locally first

`npm run build`, then `npm run preview`, then open http://localhost:4173. This is exactly what Cloudflare serves.

## If a build fails

Cloudflare shows the build log under the project's **Deployments**. The usual causes: a type error (`npm run build` fails locally too; fix it there first) or a test-only file the type check does not like. Paste the end of the log into a Claude Code session.
