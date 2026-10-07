import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

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
  plugins: [react()],
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
