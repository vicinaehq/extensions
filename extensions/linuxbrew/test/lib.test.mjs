import test from "node:test";
import assert from "node:assert/strict";
import { parseSearchOutput, shellQuote, cleanupArgs, upgradeArgs } from "../dist/lib.mjs";

test("parseSearchOutput strips Homebrew prefixes and marks casks", () => {
  assert.deepEqual(parseSearchOutput("wget\nhomebrew/cask/ghostty\nhomebrew/core/git\n"), [
    { name: "wget", fullName: "wget", kind: "unknown" },
    { name: "ghostty", fullName: "homebrew/cask/ghostty", kind: "cask" },
    { name: "git", fullName: "homebrew/core/git", kind: "unknown" },
  ]);
});

test("shellQuote only quotes unsafe shell tokens", () => {
  assert.equal(shellQuote("/home/linuxbrew/.linuxbrew/bin/brew"), "/home/linuxbrew/.linuxbrew/bin/brew");
  assert.equal(shellQuote("weird name's"), "'weird name'\"'\"'s'");
});

test("cleanup and upgrade args include preference-controlled flags", () => {
  assert.deepEqual(cleanupArgs({ cleanupAll: false }), ["cleanup"]);
  assert.deepEqual(cleanupArgs({ cleanupAll: true }), ["cleanup", "--prune=all"]);
  assert.deepEqual(upgradeArgs("wget", { greedyUpgrades: true }), ["upgrade", "--greedy", "wget"]);
});
