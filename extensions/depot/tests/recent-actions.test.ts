import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRecentActions,
  prependRecentAction,
  type RecentAction,
} from "../src/recent-actions.ts";

const timestamp = new Date("2026-09-26T12:00:00.000Z");

test("prepends and sanitizes a recent action", () => {
  const actions = prependRecentAction([], {
    kind: "installed",
    name: "Example\nApplication",
    identifier: "example.app",
    source: "Flatpak",
  }, timestamp, "test-id");

  assert.deepEqual(actions, [{
    id: "test-id",
    kind: "installed",
    name: "Example Application",
    identifier: "example.app",
    source: "Flatpak",
    timestamp: timestamp.toISOString(),
  }]);
});

test("recent action history is bounded", () => {
  let actions: RecentAction[] = [];
  for (let index = 0; index < 30; index += 1) {
    actions = prependRecentAction(actions, {
      kind: "updated",
      name: `Application ${index}`,
      identifier: `app-${index}`,
      source: "APT",
    }, timestamp, `id-${index}`);
  }

  assert.equal(actions.length, 25);
  assert.equal(actions[0]?.id, "id-29");
  assert.equal(actions.at(-1)?.id, "id-5");
});

test("parses only valid recent action records", () => {
  const valid: RecentAction = {
    id: "valid",
    kind: "removed",
    name: "Example",
    identifier: "example",
    source: "APT",
    timestamp: timestamp.toISOString(),
  };
  const parsed = parseRecentActions(JSON.stringify([
    valid,
    { ...valid, id: "invalid-source", source: "Unknown" },
    { ...valid, id: "invalid-date", timestamp: "not-a-date" },
  ]));

  assert.deepEqual(parsed, [valid]);
  assert.deepEqual(parseRecentActions("not-json"), []);
  assert.deepEqual(parseRecentActions(undefined), []);
});
