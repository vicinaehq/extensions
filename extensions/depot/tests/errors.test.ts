import assert from "node:assert/strict";
import test from "node:test";
import {
  DepotOperationError,
  describeOperationError,
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
  assert.equal(isOperationCancelled(authentication), false);
  assert.equal(isOperationCancelled(failed), false);
  assert.equal(isOperationCancelled(new Error("cancelled")), false);
});

test("describes an operation failure without discarding backend details", () => {
  const error = new DepotOperationError(
    "TestOperationError",
    "failed",
    "Package installation failed",
    "Dependency example-runtime is unavailable",
  );

  assert.deepEqual(describeOperationError(error, "Fallback"), {
    message: "Package installation failed",
    details: "Dependency example-runtime is unavailable",
  });
  assert.deepEqual(describeOperationError(new Error("internal failure"), "Fallback"), {
    message: "Fallback",
    details: "internal failure",
  });
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

test("treats aborted signals as cancellations", () => {
  const aborted = new DOMException("This operation was aborted", "AbortError");
  const processAborted = Object.assign(new Error("Process was cancelled"), {
    name: "AbortError",
  });

  assert.equal(isOperationCancelled(aborted), true);
  assert.equal(isOperationCancelled(processAborted), true);
  assert.equal(isOperationCancelled("AbortError"), false);
  assert.equal(isOperationCancelled(undefined), false);
});

test("describes Depot errors with and without technical details", () => {
  const withoutDetails = new DepotOperationError(
    "TestOperationError",
    "network",
    "Remote could not be reached",
  );
  const blankDetails = new DepotOperationError(
    "TestOperationError",
    "failed",
    "Package installation failed",
    "  \n ",
  );
  const repeatedDetails = new DepotOperationError(
    "TestOperationError",
    "failed",
    "Package installation failed",
    "Package installation failed",
  );
  const multiLine = new DepotOperationError(
    "TestOperationError",
    "authentication",
    "Authentication was denied",
    "\nError executing command as another user\nNot authorized\n",
  );

  assert.deepEqual(describeOperationError(withoutDetails, "Fallback"), {
    message: "Remote could not be reached",
  });
  assert.deepEqual(describeOperationError(blankDetails, "Fallback"), {
    message: "Package installation failed",
  });
  assert.deepEqual(describeOperationError(repeatedDetails, "Fallback"), {
    message: "Package installation failed",
  });
  assert.deepEqual(describeOperationError(multiLine, "Fallback"), {
    message: "Authentication was denied",
    details: "Error executing command as another user\nNot authorized",
  });
});

test("describes unknown failures with the fallback message", () => {
  assert.deepEqual(describeOperationError(new Error("  "), "Fallback"), {
    message: "Fallback",
  });
  assert.deepEqual(describeOperationError(new Error("Fallback"), "Fallback"), {
    message: "Fallback",
  });
  assert.deepEqual(describeOperationError("text failure", "Fallback"), {
    message: "Fallback",
  });
});
