import assert from "node:assert/strict";
import test from "node:test";
import {
  aptDaemonPackageArgs,
  parseAptDaemonResult,
} from "../src/backends/apt-transaction.ts";

test("builds one aptdaemon transaction for multiple validated package IDs", () => {
  assert.deepEqual(
    aptDaemonPackageArgs("install", ["git", "curl", "libc6:amd64"]),
    ["--install", "git curl libc6:amd64"],
  );
});

test("recognizes aptdaemon terminal outcomes even with ANSI progress output", () => {
  assert.equal(
    parseAptDaemonResult("[+] 100% \u001b[1mFinished\u001b[0m"),
    undefined,
  );
  assert.equal(
    parseAptDaemonResult("[+] 100% \u001b[1mCancelled\u001b[0m"),
    "cancelled",
  );
  assert.equal(
    parseAptDaemonResult(
      "ERROR: org.debian.apt.TransactionFailed - Another package manager is already running",
    ),
    "busy",
  );
  assert.equal(
    parseAptDaemonResult("ERROR: error-no-package: Package is unavailable"),
    "failed",
  );
});
