import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwarePackage, SoftwareUpdate } from "../src/types.ts";
import {
  installAccessories,
  removeAccessories,
  updateAccessories,
} from "../src/utils/software-accessories.ts";

test("keeps the source badge at the right edge for install results", () => {
  assert.deepEqual(installAccessories(aptPackage(true)), [
    { text: "Installed" },
    { tag: "APT" },
  ]);
  assert.deepEqual(installAccessories(flatpakPackage()), [
    { text: "org.videolan.VLC" },
    { tag: "Flatpak · flathub" },
  ]);
});

test("keeps the source badge at the right edge for removal results", () => {
  assert.deepEqual(removeAccessories(flatpakPackage()), [
    { text: "org.videolan.VLC" },
    { tag: "Flatpak · system" },
  ]);
});

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

function aptPackage(installed: boolean): SoftwarePackage {
  return {
    id: "vlc",
    name: "VLC",
    description: "Media player",
    source: "apt",
    installed,
  };
}

function flatpakPackage(): SoftwarePackage {
  return {
    id: "org.videolan.VLC",
    name: "VLC",
    description: "Media player",
    source: "flatpak",
    installed: false,
    flatpak: { remote: "flathub", scope: "system", branch: "stable" },
  };
}
