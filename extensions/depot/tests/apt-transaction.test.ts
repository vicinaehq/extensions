import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAptDaemonDbusError,
  classifyAptDaemonOutcome,
  describeAptDaemonStatus,
  findUnexpectedAptDaemonRemovals,
  parseProcStartTime,
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
      message: "Authentication was cancelled",
    }),
    "cancelled",
  );
  assert.equal(
    classifyAptDaemonOutcome("exit-failed", {
      code: "error-no-package",
    }),
    "failed",
  );
});

test("distinguishes D-Bus authentication cancellation from denial", () => {
  assert.equal(
    classifyAptDaemonDbusError(
      new Error("Authentication request was cancelled"),
    ).kind,
    "cancelled",
  );
  assert.equal(
    classifyAptDaemonDbusError(
      new Error("Authentication was denied"),
    ).kind,
    "authentication",
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

test("rejects removals introduced by an install simulation", () => {
  assert.deepEqual(
    findUnexpectedAptDaemonRemovals(
      { kind: "install-packages", packageIds: ["example"] },
      [["example"], [], [], []],
      [[], [], ["conflicting-package=1.0"], [], [], [], []],
    ),
    ["conflicting-package"],
  );
});

test("allows only the requested package in a removal simulation", () => {
  const request = { kind: "remove-packages", packageIds: ["example:amd64"] } as const;
  assert.deepEqual(
    findUnexpectedAptDaemonRemovals(
      request,
      [[], [], ["example=1.0"], []],
      [[], [], [], [], [], [], []],
    ),
    [],
  );
  assert.deepEqual(
    findUnexpectedAptDaemonRemovals(
      request,
      [[], [], ["example:amd64=1.0"], []],
      [[], [], ["dependent=2.0"], [], [], [], []],
    ),
    ["dependent"],
  );
});

test("keeps architecture-qualified removals distinct", () => {
  assert.deepEqual(
    findUnexpectedAptDaemonRemovals(
      { kind: "remove-packages", packageIds: ["example:amd64"] },
      [[], [], ["example:i386=1.0"], []],
      [[], [], [], [], [], [], []],
    ),
    ["example:i386"],
  );
  assert.deepEqual(
    findUnexpectedAptDaemonRemovals(
      {
        kind: "remove-packages",
        packageIds: ["example:amd64", "example:i386"],
      },
      [[], [], ["example=1.0"], []],
      [[], [], [], [], [], [], []],
    ),
    ["example"],
  );
});

test("fails closed when aptdaemon simulation groups are malformed", () => {
  assert.equal(
    findUnexpectedAptDaemonRemovals(
      { kind: "upgrade-packages", packageIds: ["example"] },
      null,
      [],
    ),
    undefined,
  );
});

test("reads the race-safe process start time used for Polkit", () => {
  const fields = ["S", ...Array.from({ length: 18 }, (_, index) => String(index)), "424242"];
  assert.equal(
    parseProcStartTime(`123 (Depot worker (test)) ${fields.join(" ")}`),
    "424242",
  );
  assert.equal(parseProcStartTime("invalid"), undefined);
});
