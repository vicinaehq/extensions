import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const categories = manifest.commands.filter((command) => command.name.startsWith("settings-"));

test("all 24 sidebar categories are direct root-search commands, without an inner search view", () => {
  assert.equal(categories.length, 24);
  assert.equal(new Set(categories.map((command) => command.name)).size, 24);
  assert.equal(categories[0].title, "Wallpaper & colors");
  assert.ok(categories.every((command) => command.mode === "no-view"));
  assert.ok(!manifest.commands.some((command) => command.name === "dsettings_search"));
  assert.ok(!categories.some((command) => command.name === "settings-notification-rules"));
});

test("every root command opens its matching Dux category and has an original icon", () => {
  for (const command of categories) {
    const category = command.name.slice("settings-".length).replaceAll("-", "_");
    const entrypoint = readFileSync(new URL(`../src/${command.name}.ts`, import.meta.url), "utf8");
    assert.ok(entrypoint.includes(`openSettings.bind(null, "${category}")`));
    assert.equal(command.icon, `settings/${category}.svg`);
    const svg = readFileSync(new URL(`../assets/${command.icon}`, import.meta.url), "utf8");
    assert.match(svg, /<svg/);
    assert.match(svg, /<path[^>]+d="[^"]+"/);
    assert.match(svg, /id="dux-badge"/);
    assert.match(svg, /<circle[^>]+stroke=/);
    assert.ok(command.subtitle.startsWith("Dux Shell"));
  }
});

test("keywords are supplied separately from titles for Vicinae's native root-search ranking", () => {
  const command = (name) => categories.find((item) => item.name === name);
  assert.equal(command("settings-personalization").title, "Wallpaper & colors");
  assert.ok(command("settings-theme-surfaces").keywords.includes("blur"));
  assert.ok(command("settings-applications").keywords.includes("browser"));
  assert.ok(command("settings-network").keywords.includes("wi-fi"));
  assert.ok(categories.every((item) => Array.isArray(item.keywords) && item.keywords.includes("dux")));
});

test("legacy commands and third-party attribution are retained", () => {
  for (const name of ["dsettings", "dnotepad", "dsearch", "dsearch_index"]) {
    assert.ok(manifest.commands.some((command) => command.name === name));
  }
  assert.equal(manifest.name, "dms-integration");
  assert.equal(manifest.title, "Dux Shell");
  assert.ok(manifest.contributors.includes("denogio"));
  assert.ok(existsSync(new URL("../assets/settings/LICENSE-Material-Symbols.txt", import.meta.url)));
  assert.ok(existsSync(new URL("../assets/LICENSE-Dux-Shell.txt", import.meta.url)));
});
