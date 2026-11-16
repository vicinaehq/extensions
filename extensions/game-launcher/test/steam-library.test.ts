import { symlinkSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { isTool, readLibraryFolders, readManifests, scanSteamInstall } from "../src/lib/steam/library";
import { writeAppinfo } from "./fixtures/appinfo-writer";
import { libraryFolders, localConfig, makeTempDir, manifest, writeFile } from "./fixtures/fake-steam";

const NOW = 1794600000;

describe("scanSteamInstall", () => {
  let root: string;
  let extraLib: string;

  beforeAll(() => {
    root = makeTempDir();
    extraLib = makeTempDir();
    writeFile(join(root, "steamapps/libraryfolders.vdf"), libraryFolders([root, extraLib, "/nonexistent/library"]));

    // Library 1: a game, a tool, and a game that's still downloading.
    writeFile(join(root, "steamapps/appmanifest_100.acf"), manifest({ appid: 100, name: "Alpha Game", installdir: "Alpha", SizeOnDisk: 5000 }));
    writeFile(join(root, "steamapps/appmanifest_1493710.acf"), manifest({ appid: 1493710, name: "Proton Experimental", installdir: "Proton - Experimental" }));
    writeFile(join(root, "steamapps/appmanifest_300.acf"), manifest({ appid: 300, name: "Downloading", installdir: "Dl", StateFlags: 1026 }));
    writeFile(join(root, "steamapps/appmanifest_bad.acf"), "garbage {");
    writeFile(join(root, "steamapps/appmanifest_400.acf"), "not a manifest");
    // Library 2: a game whose only play time is in the manifest, plus a duplicate of 100.
    writeFile(join(extraLib, "steamapps/appmanifest_200.acf"), manifest({ appid: 200, name: "Beta: The Sequel II", installdir: "Beta", LastPlayed: NOW - 50 }));
    writeFile(join(extraLib, "steamapps/appmanifest_100.acf"), manifest({ appid: 100, name: "Alpha (copy)", installdir: "Alpha" }));

    writeFile(
      join(root, "appcache/appinfo.vdf"),
      writeAppinfo(
        [
          { appid: 100, kv: { appinfo: { common: { name: "Alpha Game", type: "Game", icon: "a".repeat(40), clienticon: "c".repeat(40) } } } },
          { appid: 200, kv: { appinfo: { common: { name: "Beta", type: "game" } } } },
          { appid: 1493710, kv: { appinfo: { common: { name: "Proton Experimental", type: "Tool" } } } },
        ],
        29,
      ),
    );

    // Two accounts: the newest LastPlayed and the largest playtime win. 86400 is Steam's "never" placeholder.
    writeFile(join(root, "userdata/111/config/localconfig.vdf"), localConfig({ 100: { LastPlayed: NOW - 3600, Playtime: 90 }, 1493710: { LastPlayed: 86400 } }));
    writeFile(join(root, "userdata/222/config/localconfig.vdf"), localConfig({ 100: { LastPlayed: NOW - 7200, Playtime: 300 } }));

    // Artwork: app 100 uses the hashed-subdir layout (two versions of the capsule), app 200 the legacy flat layout.
    const old = writeFile(join(root, "appcache/librarycache/100/1111/library_capsule.jpg"), "old");
    utimesSync(old, new Date(2020, 0, 1), new Date(2020, 0, 1));
    writeFile(join(root, "appcache/librarycache/100/2222/library_capsule.jpg"), "new");
    writeFile(join(root, "appcache/librarycache/100/library_header.jpg"));
    writeFile(join(root, "appcache/librarycache/100/" + "a".repeat(40) + ".jpg"));
    writeFile(join(root, "appcache/librarycache/200_library_600x900.jpg"));
    writeFile(join(root, "appcache/librarycache/200_header.jpg"));
    writeFile(join(root, "steam/games/" + "c".repeat(40) + ".ico"));
    // Custom grid art overrides the cache.
    writeFile(join(root, "userdata/111/config/grid/200p.png"));
  });

  it("reads all library folders including the root", () => {
    expect(readLibraryFolders(root)).toEqual({ paths: [root, extraLib, "/nonexistent/library"] });
  });

  it("returns installed games only, with tools filtered", () => {
    const { games, warnings, installedAppids, complete } = scanSteamInstall({ root, kind: "native" });
    expect(games.map((g) => g.steam?.appid).sort()).toEqual([100, 200]);
    expect(warnings).toEqual([
      expect.stringMatching(/^Couldn't read Steam app manifest .*appmanifest_400\.acf: /),
      "Steam library folder not found (drive not mounted?): /nonexistent/library",
    ]);
    // Tools, apps mid-download/update (300: StateFlags 1026, no FullyInstalled bit) and manifests that can't
    // be read (400) are still on disk, so their cached art must survive pruning. The missing
    // library makes the scan partial. appmanifest_bad.acf has no appid in its name, so it's ignored.
    expect(installedAppids.sort((a, b) => a - b)).toEqual([100, 200, 300, 400, 1493710]);
    expect(complete).toBe(false);
  });

  it("includes tools when asked", () => {
    const { games } = scanSteamInstall({ root, kind: "native" }, { includeTools: true });
    const proton = games.find((g) => g.steam?.appid === 1493710);
    expect(proton?.steam).toEqual({ appid: 1493710, type: "tool", isTool: true });
    expect(proton?.lastPlayed).toBe(0); // 86400 placeholder ignored
  });

  it("builds launch info, activity and artwork", () => {
    const { games } = scanSteamInstall({ root, kind: "native" });
    const alpha = games.find((g) => g.steam?.appid === 100)!;
    expect(alpha).toMatchObject({
      id: "steam:100",
      title: "Alpha Game", // first library wins over the duplicate
      launchUri: "steam://rungameid/100",
      installDir: join(root, "steamapps/common/Alpha"),
      sizeOnDisk: 5000,
      lastPlayed: NOW - 3600,
      playtimeMinutes: 300,
    });
    expect(alpha.artwork.portrait).toBe(join(root, "appcache/librarycache/100/2222/library_capsule.jpg"));
    expect(alpha.artwork.header).toBe(join(root, "appcache/librarycache/100/library_header.jpg"));
    expect(alpha.artwork.icon).toBe(join(root, "appcache/librarycache/100/" + "a".repeat(40) + ".jpg"));
    expect(alpha.steam?.clientIcon).toBe("c".repeat(40));
    expect(alpha.steam?.localIco).toBe(join(root, "steam/games/" + "c".repeat(40) + ".ico"));

    const beta = games.find((g) => g.steam?.appid === 200)!;
    expect(beta.lastPlayed).toBe(NOW - 50);
    expect(beta.installDir).toBe(join(extraLib, "steamapps/common/Beta"));
    expect(beta.artwork.portrait).toBe(join(root, "userdata/111/config/grid/200p.png"));
    expect(beta.customArtwork).toEqual({ portrait: join(root, "userdata/111/config/grid/200p.png") });
    expect(alpha.customArtwork).toEqual({});
    expect(beta.artwork.header).toBe(join(root, "appcache/librarycache/200_header.jpg"));
    expect(beta.keywords).toEqual(expect.arrayContaining(["btsii", "bts", "200"]));
  });

  it("falls back to name rules when appinfo.vdf is missing", () => {
    const bare = makeTempDir();
    writeFile(join(bare, "steamapps/appmanifest_1628350.acf"), manifest({ appid: 1628350, name: "Steam Linux Runtime 3.0 (sniper)", installdir: "SLR" }));
    writeFile(join(bare, "steamapps/appmanifest_9999999.acf"), manifest({ appid: 9999999, name: "Proton 11.0", installdir: "Proton 11.0" }));
    writeFile(join(bare, "steamapps/appmanifest_10.acf"), manifest({ appid: 10, name: "Counter-Strike", installdir: "cs" }));
    const { games, warnings, complete } = scanSteamInstall({ root: bare, kind: "native" });
    expect(games.map((g) => g.title)).toEqual(["Counter-Strike"]);
    expect(complete).toBe(true);
    expect(warnings[0]).toMatch(/appinfo.vdf/);
  });
});

describe("isTool", () => {
  const m = (appid: number, name: string) => ({ appid, name, installDir: "", libraryPath: "", stateFlags: 4 });
  it("trusts appinfo types over names", () => {
    expect(isTool(m(1, "Proton-themed puzzle game"), { type: "game" })).toBe(false);
    expect(isTool(m(2, "Blender"), { type: "application" })).toBe(false);
    expect(isTool(m(3, "Some DLC"), { type: "dlc" })).toBe(true);
  });
});

describe("library folders", () => {
  it("treats an empty mount point (no steamapps/) as unreachable, so the scan isn't complete", () => {
    const root = makeTempDir();
    const unmounted = makeTempDir(); // exists, but the drive "isn't mounted"
    writeFile(join(root, "steamapps/libraryfolders.vdf"), libraryFolders([root, unmounted]));
    writeFile(join(root, "steamapps/appmanifest_1.acf"), manifest({ appid: 1, name: "One", installdir: "One" }));
    const result = scanSteamInstall({ root, kind: "native" });
    expect(result.complete).toBe(false);
    expect(result.warnings).toContain(`Steam library folder not found (drive not mounted?): ${unmounted}`);
  });

  it("counts an unreadable library list as an incomplete scan, still listing the Steam root's games", () => {
    const root = makeTempDir();
    writeFile(join(root, "steamapps/libraryfolders.vdf"), '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path" "'); // half-written
    writeFile(join(root, "steamapps/appmanifest_1.acf"), manifest({ appid: 1, name: "One", installdir: "One" }));
    const result = scanSteamInstall({ root, kind: "native" });
    expect(result.games.map((g) => g.title)).toEqual(["One"]);
    expect(result.complete).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringMatching(/^Couldn't read Steam's library folder list .*libraryfolders\.vdf/));
  });

  it("falls back to config/libraryfolders.vdf when the steamapps one is unreadable, but still flags the scan", () => {
    const root = makeTempDir();
    const lib = makeTempDir();
    writeFile(join(root, "steamapps/libraryfolders.vdf"), "{broken");
    writeFile(join(root, "config/libraryfolders.vdf"), libraryFolders([root, lib]));
    writeFile(join(lib, "steamapps/appmanifest_1.acf"), manifest({ appid: 1, name: "Elsewhere", installdir: "E" }));
    const result = scanSteamInstall({ root, kind: "native" });
    expect(result.games.map((g) => g.title)).toEqual(["Elsewhere"]);
    expect(result.complete).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining(`using ${join(root, "config/libraryfolders.vdf")}`));
  });

  it("counts a library list with no libraryfolders section (e.g. truncated) as unreadable", () => {
    const root = makeTempDir();
    writeFile(join(root, "steamapps/libraryfolders.vdf"), "");
    writeFile(join(root, "steamapps/appmanifest_1.acf"), manifest({ appid: 1, name: "One", installdir: "One" }));
    const result = scanSteamInstall({ root, kind: "native" });
    expect(result.complete).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining('no "libraryfolders" section'));
  });

  it("is complete without any library list: the Steam root is the only library", () => {
    const root = makeTempDir();
    writeFile(join(root, "steamapps/appmanifest_1.acf"), manifest({ appid: 1, name: "One", installdir: "One" }));
    const result = scanSteamInstall({ root, kind: "native" });
    expect(result.complete).toBe(true);
    expect(result.warnings.filter((w) => w.includes("library folder list"))).toEqual([]);
  });

  it("keeps an app with an unreadable manifest installed, so its cached art isn't pruned", () => {
    const root = makeTempDir();
    writeFile(join(root, "steamapps/libraryfolders.vdf"), libraryFolders([root]));
    writeFile(join(root, "steamapps/appmanifest_1.acf"), manifest({ appid: 1, name: "One", installdir: "One" }));
    writeFile(join(root, "steamapps/appmanifest_2.acf"), '"AppState"\n{\n\t"appid" "2"'); // half-written
    writeFile(join(root, "steamapps/appmanifest_3.acf"), '"AppState"\n{\n\t"appid" "3"\n\t"installdir" "Three"\n}\n'); // no name yet
    const result = scanSteamInstall({ root, kind: "native" });
    expect(result.games.map((g) => g.title)).toEqual(["One"]);
    expect(result.installedAppids.sort()).toEqual([1, 2, 3]);
    expect(result.complete).toBe(true);
    // Only the unreadable one is warned about: a manifest without a name is a state Steam writes itself.
    expect(result.warnings.filter((w) => w.includes("manifest"))).toEqual([
      expect.stringMatching(new RegExp(`^Couldn't read Steam app manifest ${join(root, "steamapps/appmanifest_2.acf")}: `)),
    ]);
    expect(readManifests(root).otherAppids.sort()).toEqual([2, 3]);
  });

  it("de-duplicates library folders listed through a symlink", () => {
    const root = makeTempDir();
    const link = join(makeTempDir(), "steam-link");
    symlinkSync(root, link);
    writeFile(join(root, "steamapps/libraryfolders.vdf"), libraryFolders([link, root]));
    expect(readLibraryFolders(root).paths).toEqual([root]);
  });
});

describe("Steam root without steamapps/", () => {
  it("is fine when every game lives in other library folders", () => {
    const root = makeTempDir();
    const lib = makeTempDir();
    writeFile(join(root, "config/libraryfolders.vdf"), libraryFolders([root, lib]));
    writeFile(join(lib, "steamapps/appmanifest_1.acf"), manifest({ appid: 1, name: "Elsewhere", installdir: "E" }));
    const result = scanSteamInstall({ root, kind: "native" });
    expect(result.complete).toBe(true);
    expect(result.games.map((g) => g.title)).toEqual(["Elsewhere"]);
    expect(result.warnings.filter((w) => w.includes("not mounted"))).toEqual([]);
  });
});

describe("scanSteam with several installs", () => {
  it("uses only the first install (native before Flatpak) and notes the others", async () => {
    const { scanSteam } = await import("../src/lib/steam/scan");
    const home = makeTempDir();
    const native = join(home, ".local/share/Steam");
    const flatpak = join(home, ".var/app/com.valvesoftware.Steam/.local/share/Steam");
    writeFile(join(native, "steamapps/appmanifest_10.acf"), manifest({ appid: 10, name: "Native", installdir: "N" }));
    writeFile(join(flatpak, "steamapps/appmanifest_20.acf"), manifest({ appid: 20, name: "Flatpak", installdir: "F" }));
    const result = scanSteam({ home });
    expect(result.games.map((g) => g.title)).toEqual(["Native"]);
    expect([...result.installedAppids]).toEqual([10]);
    expect(result.warnings).toContain(
      `Also found Steam (flatpak) at ${flatpak}; only the native install is used. Set the Steam Folder setting to use a different one.`,
    );
    // The Steam Folder setting picks one explicitly, with no note.
    const chosen = scanSteam({ home, steamPath: flatpak });
    expect(chosen.games.map((g) => g.title)).toEqual(["Flatpak"]);
    expect(chosen.warnings.filter((w) => w.startsWith("Also found"))).toEqual([]);
  });
});
