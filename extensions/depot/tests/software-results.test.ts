import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwareItem, SoftwareUpdate } from "../src/types.ts";
import {
  removeSoftwareUpdates,
  softwareItemKey,
  sortSoftwareAlphabetically,
} from "../src/utils/software-results.ts";

test("uses package source and Flatpak scope as stable software identity", () => {
  const apt = aptPackage("org.example.App", "APT application");
  const userFlatpak = flatpakPackage(
    "org.example.App",
    "Example",
    "User Flatpak",
  );
  const systemFlatpak: SoftwareItem = {
    ...userFlatpak,
    flatpak: { remote: "flathub", scope: "system", branch: "stable" },
  };

  assert.equal(softwareItemKey(apt), "apt:org.example.App");
  assert.equal(softwareItemKey(userFlatpak), "flatpak:user:org.example.App");
  assert.equal(softwareItemKey(systemFlatpak), "flatpak:system:org.example.App");
});

test("sorts applications globally across package-manager sources", () => {
  const packages = sortSoftwareAlphabetically([
    {
      ...aptPackage("vlc", "Media player"),
      name: "VLC",
    },
    {
      ...aptPackage("builder-10", "IDE"),
      name: "Builder 10",
    },
    flatpakPackage("org.gnome.Builder2", "builder 2", "IDE"),
    flatpakPackage("com.spotify.Client", "Spotify", "Music streaming"),
  ]);

  assert.deepEqual(packages.map((pkg) => pkg.name), [
    "builder 2",
    "Builder 10",
    "Spotify",
    "VLC",
  ]);
  assert.deepEqual(packages.map((pkg) => pkg.source), [
    "flatpak",
    "apt",
    "flatpak",
    "apt",
  ]);
});

test("alphabetical sorting does not mutate backend results", () => {
  const original = [
    flatpakPackage("org.videolan.VLC", "VLC", "Media player"),
    flatpakPackage("com.spotify.Client", "Spotify", "Music streaming"),
  ];
  const packages = sortSoftwareAlphabetically(original);

  assert.deepEqual(original.map((pkg) => pkg.name), ["VLC", "Spotify"]);
  assert.deepEqual(packages.map((pkg) => pkg.name), ["Spotify", "VLC"]);
});

test("removes completed updates without clearing another Flatpak scope", () => {
  const userUpdate: SoftwareUpdate = {
    ...flatpakPackage("org.example.App", "Example", "User app"),
    availableVersion: "2",
  };
  const systemUpdate: SoftwareUpdate = {
    ...userUpdate,
    flatpak: { remote: "flathub", scope: "system", branch: "stable" },
  };

  assert.deepEqual(
    removeSoftwareUpdates([userUpdate, systemUpdate], [userUpdate]),
    [systemUpdate],
  );
});

function aptPackage(id: string, description: string): SoftwareItem {
  return {
    id,
    name: id,
    description,
    source: "apt",
    installed: false,
  };
}

function flatpakPackage(
  id: string,
  name: string,
  description: string,
): SoftwareItem {
  return {
    id,
    name,
    description,
    source: "flatpak",
    installed: false,
    flatpak: { remote: "flathub", scope: "user", branch: "stable" },
  };
}
