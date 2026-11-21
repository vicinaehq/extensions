import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwareItem, SoftwareUpdate } from "../src/types.ts";
import { updateAccessories } from "../src/utils/software-accessories.ts";

test("keeps the source badge at the right edge after update metadata", () => {
  const update: SoftwareUpdate = {
    ...flatpakPackage(),
    currentVersion: "3.0.21",
    availableVersion: "3.0.22",
    downloadSize: "42 MB",
  };

  assert.deepEqual(updateAccessories(update), [
    { text: "3.0.21 → 3.0.22" },
    { text: "42 MB" },
    { tag: "Flatpak · system" },
  ]);
});

function aptPackage(installed: boolean): SoftwareItem {
  return {
    id: "vlc",
    name: "VLC",
    description: "Media player",
    source: "apt",
    installed,
  };
}

function flatpakPackage(): SoftwareItem {
  return {
    id: "org.videolan.VLC",
    name: "VLC",
    description: "Media player",
    source: "flatpak",
    installed: false,
    flatpak: { remote: "flathub", scope: "system", branch: "stable" },
  };
}
