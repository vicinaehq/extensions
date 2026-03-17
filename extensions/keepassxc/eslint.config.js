import { defineConfig } from "eslint/config";
import globals from "globals";
import pluginEslintJs from "@eslint/js";
import pluginEslintReact from "eslint-plugin-react";
import stylistic from "@stylistic/eslint-plugin";
import pluginReactHooks from "eslint-plugin-react-hooks";
import raycastConfig from "@raycast/eslint-config";

export default defineConfig([
  ...raycastConfig,
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    plugins: {
      pluginEslintJs,
      pluginEslintReact,
      "@stylistic": stylistic,
    },
    extends: [pluginEslintJs.configs.recommended, pluginEslintReact.configs.flat.recommended],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        pragma: "React",
        version: "19.1",
        defaultVersion: "19.1",
      },
    },
  },
  pluginReactHooks.configs.flat.recommended,
  {
    rules: {
      yoda: ["error", "always"],
      "arrow-body-style": ["error", "as-needed"],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-multiple-empty-lines": 1,
      "no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
          caughtErrors: "none",
          ignoreRestSiblings: false,
          reportUsedIgnorePattern: false,
        },
      ],
      "@stylistic/semi": 0,
      "@stylistic/comma-dangle": [
        1,
        {
          arrays: "only-multiline",
          objects: "only-multiline",
          imports: "only-multiline",
          exports: "only-multiline",
          functions: "only-multiline",
        },
      ],
      "@stylistic/operator-linebreak": ["error", "before"],
      "@stylistic/indent": ["error", 2, { SwitchCase: 1 }],
      "@stylistic/space-before-function-paren": [
        "error",
        {
          anonymous: "never",
          named: "never",
          asyncArrow: "always",
        },
      ],
      "@stylistic/arrow-parens": [
        "error",
        "as-needed",
        {
          requireForBlockBody: false,
        },
      ],
      "@stylistic/arrow-spacing": [
        "error",
        {
          before: true,
          after: true,
        },
      ],
      "@stylistic/no-mixed-spaces-and-tabs": 1,
      "@stylistic/jsx-closing-bracket-location": 1,
      "@stylistic/jsx-closing-tag-location": 1,
      "@stylistic/jsx-curly-brace-presence": [1, "never"],
      "@stylistic/jsx-curly-spacing": 1,
      "@stylistic/jsx-equals-spacing": 1,
      "@stylistic/jsx-first-prop-new-line": [1, "multiline-multiprop"],
      // '@stylistic/jsx-indent': [1, 2, { // deprecated
      //   checkAttributes: true,
      //   indentLogicalExpressions: true,
      // }],
      "@stylistic/jsx-pascal-case": [
        1,
        {
          allowAllCaps: false,
          allowNamespace: true,
          allowLeadingUnderscore: false,
        },
      ],
      "@stylistic/no-multi-spaces": 1,
      "@stylistic/jsx-self-closing-comp": [
        "error",
        {
          component: true,
          html: true,
        },
      ],
      "@stylistic/jsx-wrap-multilines": [
        1,
        {
          declaration: "parens-new-line",
          assignment: "parens-new-line",
          return: "parens-new-line",
          arrow: "parens-new-line",
          condition: "ignore",
          logical: "parens-new-line",
          prop: "parens-new-line",
          propertyValue: "parens-new-line",
        },
      ],
      "react/jsx-tag-spacing": [
        1,
        {
          closingSlash: "never",
          beforeSelfClosing: "always",
          afterOpening: "never",
          beforeClosing: "allow",
        },
      ],
    },
  },
]);
