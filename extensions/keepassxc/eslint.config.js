const { defineConfig } = require("eslint/config");
const raycastConfig = require("@vicinae/eslint-config");

module.exports = defineConfig([
  ...raycastConfig,
]);
