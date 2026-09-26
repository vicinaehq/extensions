import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAptDaemonOutcome,
  describeAptDaemonStatus,
} from "../src/backends/aptdaemon.ts";

test("classifies aptdaemon transaction outcomes", () => {
  assert.equal(classifyAptDaemonOutcome("exit-success"), undefined);
  assert.equal(classifyAptDaemonOutcome("exit-cancelled"), "cancelled");
  assert.equal(
    classifyAptDaemonOutcome("exit-failed", { code: "error-no-lock" }),
    "busy",
  );
  assert.equal(
    classifyAptDaemonOutcome("exit-failed", {
      code: "error-not-authorized",
    }),
    "authentication",
  );
  assert.equal(
    classifyAptDaemonOutcome("exit-failed", {
      code: "error-no-package",
    }),
    "failed",
  );
});

test("describes documented aptdaemon transaction phases", () => {
  assert.equal(
    describeAptDaemonStatus("status-resolving-dep"),
    "Resolving dependencies",
  );
  assert.equal(
    describeAptDaemonStatus("status-downloading"),
    "Downloading packages",
  );
  assert.equal(
    describeAptDaemonStatus("status-committing"),
    "Applying package changes",
  );
  assert.equal(describeAptDaemonStatus("future-status"), "APT is working");
});
