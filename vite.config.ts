import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 5173 by default; a preview tool can assign another port through PORT.
  server: { port: Number(process.env.PORT) || 5173 },
  // three.js alone is ~600 kB; the default 500 kB warning is noise for this project.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
