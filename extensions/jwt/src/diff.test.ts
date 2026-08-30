import assert from "node:assert/strict";
import { test } from "node:test";
import { diffClaims, diffLines, unifiedDiff } from "./diff.ts";

test("reports added, changed and removed claims", () => {
  const changes = diffClaims({ sub: "a", exp: 1, gone: true }, { sub: "b", exp: 1, fresh: 2 });
  assert.deepEqual(changes, [
    { key: "fresh", kind: "added", current: 2 },
    { key: "sub", kind: "changed", previous: "a", current: "b" },
    { key: "gone", kind: "removed", previous: true },
  ]);
});

test("compares arrays and objects by value, not identity", () => {
  assert.deepEqual(diffClaims({ aud: ["a", "b"] }, { aud: ["a", "b"] }), []);
  assert.equal(diffClaims({ aud: ["a"] }, { aud: ["a", "b"] }).length, 1);
});

test("treats an identical payload as no change", () => {
  assert.deepEqual(diffClaims({ sub: "a" }, { sub: "a" }), []);
});

test("distinguishes a claim set to null from an absent claim", () => {
  assert.deepEqual(diffClaims({ sub: null }, {}), [{ key: "sub", kind: "removed", previous: null }]);
});

test("marks added, removed and unchanged lines", () => {
  const lines = diffLines(["a", "b", "c"], ["a", "x", "c"]);
  assert.deepEqual(lines, [
    { kind: "context", text: "a" },
    { kind: "remove", text: "b" },
    { kind: "add", text: "x" },
    { kind: "context", text: "c" },
  ]);
});

test("prefixes a unified diff the way a patch does", () => {
  assert.equal(unifiedDiff("a\nb", "a\nc"), " a\n-b\n+c");
});

test("returns nothing when the two sides are identical", () => {
  assert.equal(unifiedDiff("a\nb", "a\nb"), "");
});

test("collapses unchanged runs and marks the gap", () => {
  const previous = ["change-me", ...Array.from({ length: 20 }, (_, i) => `line ${i}`)].join("\n");
  const current = ["changed", ...Array.from({ length: 20 }, (_, i) => `line ${i}`)].join("\n");
  const out = unifiedDiff(previous, current, 2);

  assert.match(out, /^-change-me\n\+changed\n line 0\n line 1$/);
  assert.doesNotMatch(out, /line 19/);
});

test("keeps both sides of a change in the middle of a payload", () => {
  const previous = ["a", "b", "c", "d", "e", "f", "g"].join("\n");
  const current = ["a", "b", "c", "X", "e", "f", "g"].join("\n");
  const out = unifiedDiff(previous, current, 1);

  assert.equal(out, " c\n-d\n+X\n e");
});
