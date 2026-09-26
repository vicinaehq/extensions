import assert from "node:assert/strict";
import test from "node:test";
import {
  DepotOperationError,
  isOperationCancelled,
  operationErrorMessage,
} from "../src/errors.ts";

test("recognizes user-cancelled Depot operations", () => {
  const cancelled = new DepotOperationError(
    "TestOperationError",
    "cancelled",
    "Operation cancelled",
  );
  const authentication = new DepotOperationError(
    "TestOperationError",
    "authentication",
    "Authentication cancelled",
  );
  const failed = new DepotOperationError(
    "TestOperationError",
    "failed",
    "Operation failed",
  );

  assert.equal(isOperationCancelled(cancelled), true);
  assert.equal(isOperationCancelled(authentication), true);
  assert.equal(isOperationCancelled(failed), false);
  assert.equal(isOperationCancelled(new Error("cancelled")), false);
});

test("uses a Depot operation's public message with a safe fallback", () => {
  const error = new DepotOperationError(
    "TestOperationError",
    "failed",
    "Package manager is busy",
  );

  assert.equal(operationErrorMessage(error, "Fallback"), "Package manager is busy");
  assert.equal(operationErrorMessage(new Error("internal"), "Fallback"), "Fallback");
});
