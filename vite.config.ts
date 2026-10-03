import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // three.js alone is ~600 kB; the default 500 kB warning is noise for this project.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
