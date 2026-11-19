import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwareItem, SoftwareUpdate } from "../src/types.ts";
import {
  findInstalledAlternative,
  findSoftwareUpdate,
  rankSoftwareResults,
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

test("keeps APT and Flatpak results for the same application distinct", () => {
  const apt: SoftwareItem = {
    id: "vlc",
    name: "VLC",
    description: "Media player",
    source: "apt",
    installed: false,
  };
  const flatpak: SoftwareItem = {
    id: "org.videolan.VLC",
    name: "VLC",
    description: "Media player",
    source: "flatpak",
    installed: false,
    flatpak: { remote: "flathub", scope: "user", branch: "stable" },
  };

  const combined = rankSoftwareResults("vlc", "all", [apt], [flatpak]);

  assert.deepEqual(combined.map(({ source, id }) => ({ source, id })), [
    { source: "apt", id: "vlc" },
    { source: "flatpak", id: "org.videolan.VLC" },
  ]);
});

test("promotes an exact Flatpak app above weak APT description matches", () => {
  const results = rankSoftwareResults(
    "spotify",
    "all",
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
    "all",
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

test("uses friendly AppStream names and GUI status for ranking", () => {
  const cli = aptPackage("obs-cli", "Command-line OBS controller");
  const studio = {
    ...aptPackage("obs-studio", "Live stream and record videos"),
    name: "OBS Studio",
    appstream: {
      componentId: "com.obsproject.Studio",
      kind: "desktop-application",
      isGuiApplication: true,
    },
  };

  const results = rankSoftwareResults("obs", "all", [cli, studio]);

  assert.equal(results[0]?.id, "obs-studio");
});

test("recognizes the transparent vscode alias without hiding alternatives", () => {
  const results = rankSoftwareResults(
    "vscode",
    "all",
    [aptPackage("vscode-langservers-extracted", "Language servers")],
    [{
      ...flatpakPackage(
        "com.visualstudio.code",
        "Visual Studio Code",
        "Code editing. Redefined.",
      ),
      appstream: {
        componentId: "com.visualstudio.code",
        kind: "desktop-application",
        isGuiApplication: true,
      },
    }],
  );

  assert.equal(results[0]?.id, "com.visualstudio.code");
  assert.equal(results.length, 2);
});

test("prefers a desktop application over a similarly named command-line tool", () => {
  const results = rankSoftwareResults(
    "telegram",
    "all",
    [aptPackage("telegram-send", "Send messages over Telegram from the command-line")],
    [flatpakPackage("org.telegram.desktop", "Telegram", "Messaging application")],
  );

  assert.equal(results[0]?.id, "org.telegram.desktop");
});

test("does not penalize a package variant requested explicitly", () => {
  const results = rankSoftwareResults(
    "vlc plugin",
    "all",
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
    "all",
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

test("matches architecture-qualified APT updates to an installed application", () => {
  const pkg = { ...aptPackage("vlc", "Media player"), installed: true };
  const update: SoftwareUpdate = {
    ...pkg,
    id: "vlc:amd64",
    currentVersion: "3.0",
    availableVersion: "3.1",
  };

  assert.equal(findSoftwareUpdate(pkg, [update], "amd64"), update);
  assert.equal(
    findSoftwareUpdate(aptPackage("other", "Other application"), [update], "amd64"),
    undefined,
  );
});

test("never matches a native APT package to a foreign-architecture update", () => {
  const pkg = { ...aptPackage("vlc", "Media player"), installed: true };
  const foreign: SoftwareUpdate = { ...pkg, id: "vlc:i386", availableVersion: "3.1" };
  const independent: SoftwareUpdate = { ...pkg, id: "vlc:all", availableVersion: "3.1" };

  assert.equal(findSoftwareUpdate(pkg, [foreign], "amd64"), undefined);
  assert.equal(findSoftwareUpdate(pkg, [independent], "amd64"), independent);
});

test("matches Flatpak updates by application ID and installation scope", () => {
  const user = flatpakPackage("org.example.App", "Example", "User app");
  const systemUpdate: SoftwareUpdate = {
    ...user,
    flatpak: { remote: "flathub", scope: "system", branch: "stable" },
    availableVersion: "2",
  };

  assert.equal(findSoftwareUpdate(user, [systemUpdate]), undefined);
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

test("preferred source changes ranking without hiding alternatives", () => {
  const apt = { ...aptPackage("vlc", "Media player"), name: "VLC" };
  const flatpak = flatpakPackage(
    "org.videolan.VLC",
    "VLC",
    "Media player",
  );

  const defaultResults = rankSoftwareResults("vlc", "all", [apt], [flatpak]);
  const preferredResults = rankSoftwareResults(
    "vlc",
    "flatpak",
    [apt],
    [flatpak],
  );

  assert.deepEqual(defaultResults.map((pkg) => pkg.source), ["apt", "flatpak"]);
  assert.deepEqual(preferredResults.map((pkg) => pkg.source), ["flatpak", "apt"]);
});

test("source preference does not outrank a substantially better match", () => {
  const exact = aptPackage("vlc", "Media player");
  const weak = flatpakPackage(
    "org.example.Remote",
    "VLC Remote",
    "Remote control",
  );

  const results = rankSoftwareResults("vlc", "flatpak", [exact], [weak]);

  assert.equal(results[0], exact);
});

test("finds an installed equivalent from another source", () => {
  const apt: SoftwareItem = {
    ...aptPackage("spotify-client", "Music streaming"),
    name: "Spotify Client",
    appstream: {
      componentId: "com.spotify.Client.desktop",
      kind: "desktop-application",
      isGuiApplication: true,
    },
  };
  const installedFlatpak: SoftwareItem = {
    ...flatpakPackage("com.spotify.Client", "Spotify", "Music streaming"),
    installed: true,
    appstream: {
      componentId: "com.spotify.Client",
      kind: "desktop-application",
      isGuiApplication: true,
    },
  };

  assert.equal(
    findInstalledAlternative(apt, [apt, installedFlatpak]),
    installedFlatpak,
  );
});

test("uses an exact normalized name when AppStream identity is unavailable", () => {
  const apt = { ...aptPackage("example-app", "Example"), name: "Example App" };
  const installedFlatpak: SoftwareItem = {
    ...flatpakPackage("org.example.App", "example-app", "Example"),
    installed: true,
  };

  assert.equal(
    findInstalledAlternative(apt, [installedFlatpak]),
    installedFlatpak,
  );
});

test("does not report unrelated or same-source installations as conflicts", () => {
  const apt = { ...aptPackage("vlc", "Media player"), name: "VLC" };
  const sameSource = { ...apt, id: "vlc-bin", installed: true };
  const unrelated: SoftwareItem = {
    ...flatpakPackage("org.gnome.Totem", "Videos", "Video player"),
    installed: true,
  };

  assert.equal(findInstalledAlternative(apt, [sameSource, unrelated]), undefined);
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
