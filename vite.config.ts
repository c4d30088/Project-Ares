import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Connect } from "vite";
import { listNotes, receiveNote, type KeyValue } from "./src/feedback/server";

// Playtest feedback while developing: /api/feedback is answered here with the same rules as
// the Cloudflare function (functions/api/feedback.ts), storing notes in .feedback-dev.json.
// The local password for the /feedback page is "dev" (or FEEDBACK_ADMIN_KEY if set).
function devFeedback(): Connect.NextHandleFunction {
  const file = ".feedback-dev.json";
  const load = (): Record<string, string> => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
  const kv: KeyValue = {
    async get(k) {
      return load()[k] ?? null;
    },
    async put(k, v) {
      const d = load();
      d[k] = v;
      writeFileSync(file, JSON.stringify(d, null, 1));
    },
    async list({ prefix }) {
      return { keys: Object.keys(load()).filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })), list_complete: true };
    },
  };
  return (req, res, next) => {
    // /feedback opens the feedback page, as it does on Cloudflare Pages.
    if (req.url === "/feedback" || req.url === "/feedback/") req.url = "/feedback/index.html";
    if (!req.url?.startsWith("/api/feedback")) return next();
    const reply = (r: { status: number; body: unknown }) => {
      res.statusCode = r.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(r.body));
    };
    if (req.method === "GET") {
      const auth = req.headers.authorization;
      void listNotes(kv, auth?.startsWith("Bearer ") ? auth.slice(7) : null, process.env.FEEDBACK_ADMIN_KEY ?? "dev").then(reply);
      return;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let body: unknown = null;
        try {
          body = JSON.parse(raw);
        } catch {
          // validateNote refuses it
        }
        void receiveNote(kv, body, req.socket.remoteAddress ?? "local").then(reply);
      });
      return;
    }
    next();
  };
}

// Which build this is, shown small on the setup screen so a playtest report can name it.
// Cloudflare Pages provides the commit and branch while building; locally, ask git.
function buildStamp(): string {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  const commit = (process.env.CF_PAGES_COMMIT_SHA ?? git("git rev-parse HEAD")).slice(0, 7) || "dev";
  const branch = process.env.CF_PAGES_BRANCH ?? git("git rev-parse --abbrev-ref HEAD");
  const date = new Date().toISOString().slice(0, 10);
  return `${commit}${branch && branch !== "main" ? ` · ${branch}` : ""} · ${date}`;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "dev-feedback",
      configureServer: (server) => void server.middlewares.use(devFeedback()),
      configurePreviewServer: (server) => void server.middlewares.use(devFeedback()),
    },
  ],
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  // 5173 by default; a preview tool can assign another port through PORT.
  server: { port: Number(process.env.PORT) || 5173 },
  // three.js alone is ~600 kB; the default 500 kB warning is noise for this project.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
