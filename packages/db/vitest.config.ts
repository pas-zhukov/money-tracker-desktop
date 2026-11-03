import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Allow tests without a prior `packages/core` build (esp. Windows release CI).
      "@money-tracker/core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
