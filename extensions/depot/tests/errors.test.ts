import assert from "node:assert/strict";
import test from "node:test";
import {
  isOperationCancelled,
  operationErrorMessage,
  SoftwareOperationError,
} from "../src/errors.ts";

test("recognizes user-cancelled software operations", () => {
  const cancelled = new SoftwareOperationError(
    "TestOperationError",
    "cancelled",
    "Operation cancelled",
  );
  const authentication = new SoftwareOperationError(
    "TestOperationError",
    "authentication",
    "Authentication cancelled",
  );
  const failed = new SoftwareOperationError(
    "TestOperationError",
    "failed",
    "Operation failed",
  );

  assert.equal(isOperationCancelled(cancelled), true);
  assert.equal(isOperationCancelled(authentication), true);
  assert.equal(isOperationCancelled(failed), false);
  assert.equal(isOperationCancelled(new Error("cancelled")), false);
});

test("uses a software operation's public message with a safe fallback", () => {
  const error = new SoftwareOperationError(
    "TestOperationError",
    "failed",
    "Package manager is busy",
  );

  assert.equal(operationErrorMessage(error, "Fallback"), "Package manager is busy");
  assert.equal(operationErrorMessage(new Error("internal"), "Fallback"), "Fallback");
});
