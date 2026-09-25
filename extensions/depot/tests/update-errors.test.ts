import assert from "node:assert/strict";
import test from "node:test";
import { updateSourceErrors } from "../src/utils/update-errors.ts";

test("labels partial update-source failures", () => {
  assert.deepEqual(updateSourceErrors("APT failed", undefined), [
    "APT: APT failed",
  ]);
  assert.deepEqual(updateSourceErrors(undefined, "Flatpak failed"), [
    "Flatpak: Flatpak failed",
  ]);
  assert.deepEqual(updateSourceErrors("APT failed", "Flatpak failed"), [
    "APT: APT failed",
    "Flatpak: Flatpak failed",
  ]);
  assert.deepEqual(updateSourceErrors(), []);
});
