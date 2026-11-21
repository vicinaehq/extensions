import assert from "node:assert/strict";
import test from "node:test";
import { sourceWarning, updateSourceErrors } from "../src/utils/update-errors.ts";

test("labels partial update-source failures", () => {
  assert.deepEqual(updateSourceErrors({ message: "APT failed" }, undefined), [
    "APT: APT failed",
  ]);
  assert.deepEqual(updateSourceErrors(undefined, { message: "Flatpak failed" }), [
    "Flatpak: Flatpak failed",
  ]);
  assert.deepEqual(
    updateSourceErrors({ message: "APT failed" }, { message: "Flatpak failed" }),
    ["APT: APT failed", "Flatpak: Flatpak failed"],
  );
  assert.deepEqual(updateSourceErrors(), []);
});

test("shows the last technical detail line of a source failure", () => {
  assert.equal(
    sourceWarning("APT", {
      message: "APT could not prepare a cleanup plan",
      details: "Reading package lists...\nE: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\n",
    }),
    "APT: APT could not prepare a cleanup plan · E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)",
  );
});
