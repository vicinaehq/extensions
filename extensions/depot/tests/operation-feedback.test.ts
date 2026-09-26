import assert from "node:assert/strict";
import test from "node:test";
import { operationProgressMessage } from "../src/utils/operation-progress.ts";

test("formats only backend-reported progress percentages", () => {
  assert.equal(
    operationProgressMessage({
      message: "Downloading packages",
      percent: 42,
      cancellable: true,
    }),
    "Downloading packages · 42%",
  );
  assert.equal(
    operationProgressMessage({
      message: "Flatpak is working",
      cancellable: false,
    }),
    "Flatpak is working",
  );
});
