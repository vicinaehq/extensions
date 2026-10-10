import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwarePackage } from "../src/types.ts";
import {
  rankSoftwareResults,
  sortSoftwareAlphabetically,
} from "../src/utils/software-results.ts";

test("keeps APT and Flatpak results for the same application distinct", () => {
  const apt: SoftwarePackage = {
    id: "vlc",
    name: "VLC",
    description: "Media player",
    source: "apt",
    installed: false,
  };
  const flatpak: SoftwarePackage = {
    id: "org.videolan.VLC",
    name: "VLC",
    description: "Media player",
    source: "flatpak",
    installed: false,
    flatpak: { remote: "flathub", scope: "user", branch: "stable" },
  };

  const combined = rankSoftwareResults("vlc", [apt], [flatpak]);

  assert.deepEqual(combined.map(({ source, id }) => ({ source, id })), [
    { source: "apt", id: "vlc" },
    { source: "flatpak", id: "org.videolan.VLC" },
  ]);
});

test("promotes an exact Flatpak app above weak APT description matches", () => {
  const results = rankSoftwareResults(
    "spotify",
    [
      aptPackage(
        "python3-spotipy",
        "Lightweight library for accessing the Spotify Web API",
      ),
      aptPackage("libplayerctl-dev", "utility library development files"),
      aptPackage("mopidy", "extensible music server"),
    ],
    [flatpakPackage("com.spotify.Client", "Spotify", "Online music streaming")],
  );

  assert.equal(results[0]?.id, "com.spotify.Client");
});

test("keeps exact APT and Flatpak choices together ahead of plugins", () => {
  const results = rankSoftwareResults(
    "vlc",
    [
      aptPackage("vlc-plugin-base", "multimedia player plugins"),
      aptPackage("vlc", "multimedia player and streamer"),
      aptPackage("libvlc-dev", "development files for libVLC"),
    ],
    [
      flatpakPackage("org.videolan.VLC.Plugin.bdj", "VLC BDJ plugin", "VLC plugin"),
      flatpakPackage("org.videolan.VLC", "VLC", "Media player"),
    ],
  );

  assert.deepEqual(results.slice(0, 2).map((pkg) => pkg.id), [
    "vlc",
    "org.videolan.VLC",
  ]);
});

test("prefers a desktop application over a similarly named command-line tool", () => {
  const results = rankSoftwareResults(
    "telegram",
    [aptPackage("telegram-send", "Send messages over Telegram from the command-line")],
    [flatpakPackage("org.telegram.desktop", "Telegram", "Messaging application")],
  );

  assert.equal(results[0]?.id, "org.telegram.desktop");
});

test("does not penalize a package variant requested explicitly", () => {
  const results = rankSoftwareResults(
    "vlc plugin",
    [
      aptPackage("vlc", "multimedia player"),
      aptPackage("vlc-plugin-base", "base plugins for VLC"),
    ],
  );

  assert.equal(results[0]?.id, "vlc-plugin-base");
});

test("always preserves an exact technical package ID match", () => {
  const results = rankSoftwareResults(
    "libplayerctl-dev",
    [
      aptPackage("playerctl", "media player controller"),
      aptPackage("libplayerctl-dev", "development files for playerctl"),
    ],
  );

  assert.equal(results[0]?.id, "libplayerctl-dev");
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

function aptPackage(id: string, description: string): SoftwarePackage {
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
): SoftwarePackage {
  return {
    id,
    name,
    description,
    source: "flatpak",
    installed: false,
    flatpak: { remote: "flathub", scope: "user", branch: "stable" },
  };
}
