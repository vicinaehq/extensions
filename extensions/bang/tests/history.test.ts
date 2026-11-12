import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseBash, parseZsh, parseFish, uniqueRecent } from "../src/lib/history";

test("bash reads timestamps", () => {
  assert.deepEqual(parseBash("#1700000000\nls -la\n#1700000001\ngit status\n"), [
    { command: "ls -la", timestamp: 1700000000, source: "bash" },
    { command: "git status", timestamp: 1700000001, source: "bash" }
  ]);
});
test("zsh reads extended history", () => {
  assert.deepEqual(parseZsh(": 1700000000:0;docker compose up -d\n")[0], {
    command: "docker compose up -d", timestamp: 1700000000, source: "zsh"
  });
});
test("fish reads basic history", () => {
  assert.equal(parseFish("- cmd: git status\n  when: 1700000000\n")[0].timestamp, 1700000000);
});
test("duplicate commands keep latest entry", () => {
  const entries = parseBash("ls\npwd\nls\n");
  assert.deepEqual(uniqueRecent(entries).map(e => e.command), ["ls", "pwd"]);
});
