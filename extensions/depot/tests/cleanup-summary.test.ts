import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCleanupTargets } from "../src/utils/cleanup.ts";

test("counts reviewed APT and Flatpak cleanup targets", () => {
  assert.deepEqual(summarizeCleanupTargets(2, 1, 3), {
    cleanableCount: 6,
    hasAptCleanup: true,
  });
  assert.deepEqual(summarizeCleanupTargets(0, 0, 2), {
    cleanableCount: 2,
    hasAptCleanup: false,
  });
});

test("reports Nothing to Clean when every source is empty", () => {
  // Stock Ubuntu always limits the unprivileged view of the partial cache;
  // that state is informational and must not make cleanup actionable.
  assert.deepEqual(summarizeCleanupTargets(0, 0, 0), {
    cleanableCount: 0,
    hasAptCleanup: false,
  });
});
