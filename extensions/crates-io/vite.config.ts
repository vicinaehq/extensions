import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    include: ["src/**/*.e2e.test.ts", "src/**/*.e2e.test.tsx"],
    environment: "jsdom",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    alias: { "@raycast/api": "@vicinae/api" },
  },
});
