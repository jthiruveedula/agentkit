import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "../src/prompt_analytics/web",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["src/__tests__/setup.ts"] },
});
