import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.tsx"],
    alias: {
      "@vicinae/api": path.resolve(__dirname, "test/mock-vicinae.tsx"),
    },
  },
});
