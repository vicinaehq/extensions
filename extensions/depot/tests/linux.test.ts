import assert from "node:assert/strict";
import test from "node:test";
import { isAbsolute } from "node:path";
import { LINUX_EXECUTABLES, userDataDirectory } from "../src/linux.ts";

test("uses absolute paths for trusted system executables", () => {
  for (const [name, path] of Object.entries(LINUX_EXECUTABLES)) {
    assert.equal(isAbsolute(path), true, `${name} must use an absolute path`);
  }
});

test("uses an absolute XDG data directory when configured", () => {
  assert.equal(
    userDataDirectory("/mnt/user data", "/home/test"),
    "/mnt/user data",
  );
});

test("falls back to the standard user data directory", () => {
  assert.equal(
    userDataDirectory(undefined, "/home/test"),
    "/home/test/.local/share",
  );
  assert.equal(
    userDataDirectory("relative/path", "/home/test"),
    "/home/test/.local/share",
  );
});
