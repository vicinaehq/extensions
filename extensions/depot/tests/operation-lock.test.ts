import assert from "node:assert/strict";
import test from "node:test";
import { OperationLock } from "../src/utils/operation-lock.ts";

test("serializes package-manager operations", () => {
  const lock = new OperationLock();

  assert.equal(lock.tryAcquire("apt:vlc"), true);
  assert.equal(lock.tryAcquire("all"), false);
  lock.release("all");
  assert.equal(lock.tryAcquire("refresh"), false);
  lock.release("apt:vlc");
  assert.equal(lock.tryAcquire("all"), true);
});
