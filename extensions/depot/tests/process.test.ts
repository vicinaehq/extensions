import assert from "node:assert/strict";
import test from "node:test";
import { LatestRequest } from "../src/utils/latest-request.ts";
import {
  isProcessAborted,
  runProcess,
} from "../src/utils/process.ts";

test("passes arguments literally without shell interpretation", async () => {
  const value = "$(printf injected); `id`; *; package name";
  const result = await runProcess(
    "/usr/bin/printf",
    ["%s", value],
  );

  assert.equal(result.stdout, value);
});

test("aborts an active child process", async () => {
  const controller = new AbortController();
  const pending = runProcess(
    "/usr/bin/sleep",
    ["10"],
    { signal: controller.signal },
  );

  setTimeout(() => controller.abort(), 30);
  await assert.rejects(pending, isProcessAborted);
});

test("marks replaced requests stale and aborts their signals", () => {
  const latest = new LatestRequest();
  const first = latest.start();
  const second = latest.start();

  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);

  latest.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(second.isCurrent(), false);
});
