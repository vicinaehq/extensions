import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["vicinae-env.d.ts"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    ...js.configs.recommended,
  },
  ...tseslint.configs.recommended,
];