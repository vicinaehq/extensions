import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRecentActions,
  prependRecentAction,
  recentActionSource,
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

test("keeps bounded diagnostic details for failed actions", () => {
  const actions = prependRecentAction([], {
    kind: "failed",
    name: "Example",
    identifier: "example",
    source: "APT",
    summary: "Installation\nfailed",
    details: `First line\n${"x".repeat(5_000)}`,
  }, timestamp, "failure-id");

  assert.equal(actions[0]?.summary, "Installation failed");
  assert.equal(actions[0]?.details?.startsWith("First line\n"), true);
  assert.equal(actions[0]?.details?.length, 4_000);
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

test("strips credentials from URLs in failure details", () => {
  const details = [
    "Err:1 https://user:s3cret@repo.example.com/ubuntu noble InRelease",
    "Fetching http://token@mirror.example.org/pool and https://plain.example.net/x",
  ].join("\n");
  const [stored] = prependRecentAction([], {
    kind: "failed",
    name: "Example",
    identifier: "example",
    source: "APT",
    details,
  }, timestamp, "credential-id");

  assert.equal(
    stored?.details,
    [
      "Err:1 https://repo.example.com/ubuntu noble InRelease",
      "Fetching http://mirror.example.org/pool and https://plain.example.net/x",
    ].join("\n"),
  );
  assert.doesNotMatch(
    parseRecentActions(JSON.stringify([{ ...stored, details }]))[0]?.details ?? "",
    /s3cret|token@/,
  );
});

test("maps backend and local package kinds to history sources", () => {
  assert.equal(recentActionSource("apt"), "APT");
  assert.equal(recentActionSource("deb"), "APT");
  assert.equal(recentActionSource("flatpak"), "Flatpak");
  assert.equal(recentActionSource("flatpak-bundle"), "Flatpak");
  assert.equal(recentActionSource("flatpakref"), "Flatpak");
  assert.equal(recentActionSource("appimage"), "AppImage");
});
