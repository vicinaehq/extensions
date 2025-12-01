import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
]);
