import { defineConfig } from "eslint/config";
import raycastConfig from "@raycast/eslint-config";

export default defineConfig([
  ...raycastConfig,
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
