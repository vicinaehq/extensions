import assert from "node:assert/strict";
import test from "node:test";
import { DBusError } from "dbus-native";
import { NO_AUTHENTICATION_AGENT_MESSAGE } from "../src/backends/apt-errors.ts";
import {
  aptSimulationArgs,
  classifyPkexecExit,
} from "../src/backends/apt-transaction.ts";
import {
  classifyAptDaemonDbusError,
  classifyAptDaemonOutcome,
  classifyPkcheckExit,
  describeAptDaemonStatus,
  findUnexpectedAptDaemonRemovals,
  parseProcStartTime,
  preauthorizationAction,
} from "../src/backends/aptdaemon.ts";

// Error codes and D-Bus names below are those aptdaemon 2.0.2 defines in
// aptdaemon/enums.py and aptdaemon/errors.py.
const SUBJECT = "('system-bus-name', {'name': ':1.142'})";

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
      message: `${SUBJECT}: org.debian.apt.install-or-remove-packages`,
    }),
    "authentication",
  );
  assert.equal(
    classifyAptDaemonOutcome("exit-failed", {
      code: "error-auth-failed",
      message: `${SUBJECT}: org.debian.apt.update-cache`,
    }),
    "authentication",
  );
  assert.equal(
    classifyAptDaemonOutcome("exit-failed", { code: "error-no-package" }),
    "failed",
  );
});

test("classifies aptdaemon D-Bus errors by their real names", () => {
  const dbusError = (name: string, message: string) =>
    new DBusError(message, name);
  assert.equal(
    classifyAptDaemonDbusError(dbusError(
      "org.freedesktop.PolicyKit.Error.NotAuthorized",
      `${SUBJECT}: org.debian.apt.install-or-remove-packages`,
    )).kind,
    "authentication",
  );
  assert.equal(
    classifyAptDaemonDbusError(dbusError(
      "org.freedesktop.PolicyKit.Error.Failed",
      `${SUBJECT}: org.debian.apt.install-or-remove-packages`,
    )).kind,
    "authentication",
  );
  assert.equal(
    classifyAptDaemonDbusError(
      dbusError("org.debian.apt.TransactionCancelled", ""),
    ).kind,
    "cancelled",
  );
  assert.equal(
    classifyAptDaemonDbusError(dbusError(
      "org.debian.apt.TransactionFailed",
      "error-no-lock: E:Could not get lock /var/lib/dpkg/lock-frontend",
    )).kind,
    "busy",
  );
  assert.equal(
    classifyAptDaemonDbusError(dbusError(
      "org.freedesktop.DBus.Error.ServiceUnknown",
      "The name org.debian.apt was not provided by any .service files",
    )).kind,
    "unavailable",
  );
  assert.equal(
    classifyAptDaemonDbusError(new Error("unexpected")).kind,
    "failed",
  );
});

test("classifies Polkit pre-authorization exits from pkcheck(1)", () => {
  assert.equal(classifyPkcheckExit(0), undefined);
  assert.equal(classifyPkcheckExit(1)?.kind, "authentication");
  assert.equal(classifyPkcheckExit(2)?.kind, "authentication");
  assert.equal(classifyPkcheckExit(2)?.message, NO_AUTHENTICATION_AGENT_MESSAGE);
  assert.equal(classifyPkcheckExit(3)?.kind, "cancelled");
  assert.equal(classifyPkcheckExit(null), undefined);
});

test("classifies direct pkexec exits from pkexec(1)", () => {
  assert.equal(
    classifyPkexecExit(126, "Error executing command as another user: Request dismissed")?.kind,
    "cancelled",
  );
  const denied = classifyPkexecExit(
    127,
    "Error executing command as another user: Not authorized",
  );
  assert.equal(denied?.kind, "authentication");
  assert.equal(denied?.message, "Authentication was denied");
  assert.equal(
    classifyPkexecExit(
      127,
      "Error executing command as another user: No authentication agent found.",
    )?.message,
    NO_AUTHENTICATION_AGENT_MESSAGE,
  );
  assert.equal(classifyPkexecExit(100, "E: Unable to locate package"), undefined);
});

test("pre-authorizes installs with aptdaemon's real Polkit actions", () => {
  // Action IDs from /usr/share/polkit-1/actions/org.debian.apt.policy.
  assert.equal(
    preauthorizationAction({ kind: "install-packages", packageIds: ["vlc"] }),
    "org.debian.apt.install-or-remove-packages",
  );
  assert.equal(
    preauthorizationAction({ kind: "remove-packages", packageIds: ["vlc"] }),
    "org.debian.apt.install-or-remove-packages",
  );
  assert.equal(
    preauthorizationAction({ kind: "refresh-cache" }),
    "org.debian.apt.update-cache",
  );
});

test("simulates exactly the real APT arguments", () => {
  const args = ["--yes", "--no-auto-remove", "purge", "--", "libjcat1"];
  assert.deepEqual(aptSimulationArgs(args), ["--simulate", ...args]);
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
  // Targets and aptdaemon removals both use APT naming (bare = native).
  const request = { kind: "remove-packages", packageIds: ["example"] } as const;
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
      [[], [], ["example=1.0"], []],
      [[], [], ["dependent=2.0"], [], [], [], []],
    ),
    ["dependent"],
  );
});

test("blocks a native removal when a foreign-architecture package is targeted", () => {
  assert.deepEqual(
    findUnexpectedAptDaemonRemovals(
      { kind: "remove-packages", packageIds: ["example:i386"] },
      [[], [], ["example:i386=1.0", "example=1.0"], []],
      [[], [], [], [], [], [], []],
    ),
    ["example"],
  );
});

test("keeps architecture-qualified removals distinct", () => {
  assert.deepEqual(
    findUnexpectedAptDaemonRemovals(
      { kind: "remove-packages", packageIds: ["example"] },
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
      { kind: "remove-packages", packageIds: ["example"] },
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
