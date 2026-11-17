import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBash, uniqueRecent } from "../src/lib/history";
import { createHistorySearch } from "../src/lib/rank";
import { detectShell, expandPath, resolveSettings, shellHistoryPath } from "../src/lib/paths";

test("fuzzy gaps, contiguous query, literal punctuation and no matches", () => {
  const search = createHistorySearch(uniqueRecent(parseBash("git status\ndocker compose up -d\nprintf '[hello]'\n")));
  assert.equal(search("docker comp")[0].command, "docker compose up -d");
  assert.equal(search("dck cmp")[0].command, "docker compose up -d");
  assert.equal(search("gt sta")[0].command, "git status");
  assert.equal(search("[h]")[0].command, "printf '[hello]'");
  assert.deepEqual(search("no-such-command"), []);
  assert.equal(search("DOCKER")[0].command, "docker compose up -d");
});

test("blank query is newest unique; frequency and recency contribute to matched ranking", () => {
  const search = createHistorySearch(uniqueRecent(parseBash("git status\ngit status\ngit status\ngit stash\n")));
  assert.deepEqual(search("").map(item => item.command), ["git stash", "git status"]);
  assert.equal(search("git st")[0].command, "git status");
  const recent = createHistorySearch(uniqueRecent(parseBash("git status\ngit stash\n")));
  assert.equal(recent("git st")[0].command, "git stash");
  assert.equal(search("", 1).length, 1);
});

test("shell detection, format-specific paths, overrides, XDG and ZDOTDIR", () => {
  assert.equal(detectShell({ SHELL: "/usr/bin/zsh" }), "zsh");
  assert.equal(detectShell({ SHELL: "/bin/unknown" }), "bash");
  assert.equal(shellHistoryPath("fish", { XDG_DATA_HOME: "/data", fish_history: "work" }, "/home/test"), "/data/fish/work_history");
  assert.equal(shellHistoryPath("zsh", { SHELL: "/bin/bash", HISTFILE: "/bash", ZDOTDIR: "/z" }, "/home/test"), "/z/.zsh_history");
  assert.equal(shellHistoryPath("bash", { SHELL: "/bin/bash", HISTFILE: "~/history" }, "/home/test"), "/home/test/history");
  const settings = resolveSettings({ shell: "fish", historyPath: "~/custom", shellPath: "/opt/fish", maxItems: "25", hold: false }, {}, "/home/test");
  assert.equal(settings.historyPath, "/home/test/custom");
  assert.equal(settings.shellPath, "/opt/fish");
  assert.equal(settings.maxItems, 25);
  assert.equal(settings.hold, false);
  assert.equal(settings.reviewBeforeRun, true);
  assert.equal(settings.confirmBeforeRun, true);
  assert.equal(settings.saveHistory, true);
  assert.equal(resolveSettings({ reviewBeforeRun: false, saveHistory: false }, {}, "/home/test").reviewBeforeRun, false);
  assert.equal(resolveSettings({ saveHistory: false }, {}, "/home/test").saveHistory, false);
  assert.equal(resolveSettings({ confirmBeforeRun: false }, {}, "/home/test").confirmBeforeRun, false);
  assert.equal(resolveSettings({}, { SHELL: "/custom/bin/zsh" }, "/home/test").shellPath, "/custom/bin/zsh");
});

test("invalid preferences fail without interpreting shell syntax in paths", () => {
  for (const maxItems of ["0", "-1", "no", "50001", "1.5"]) assert.throws(() => resolveSettings({ maxItems }, {}, "/home/test"));
  assert.throws(() => resolveSettings({ shell: "sh" }, {}, "/home/test"));
  assert.throws(() => expandPath("relative"));
  assert.throws(() => expandPath("/path\0bad"));
  assert.equal(expandPath("/tmp/$(not-a-command);name"), "/tmp/$(not-a-command);name");
});
