import assert from "node:assert/strict";
import test from "node:test";
import { isLaunchableDesktopEntryPath } from "../src/utils/installed-application.ts";

test("accepts only absolute desktop-entry launch paths", () => {
  assert.equal(
    isLaunchableDesktopEntryPath("/usr/share/applications/vlc.desktop"),
    true,
  );
  assert.equal(isLaunchableDesktopEntryPath("relative/app.desktop"), false);
  assert.equal(isLaunchableDesktopEntryPath("/usr/bin/vlc"), false);
});
