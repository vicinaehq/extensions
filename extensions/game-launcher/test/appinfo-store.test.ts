import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanLibrary } from "../src/lib/library";
import { AppInfoStore, RECHECK_AFTER_MS, RECHECK_UNKNOWN_AFTER_MS } from "../src/lib/steam/appinfo-store";
import { scanSteamInstall } from "../src/lib/steam/library";
import { type KvValue, writeAppinfo } from "./fixtures/appinfo-writer";
import { libraryFolders, makeTempDir, manifest, writeFile } from "./fixtures/fake-steam";

describe("AppInfoStore", () => {
  it("round-trips through disk and only writes when changed", () => {
    const path = join(makeTempDir(), "nested/appinfo-cache.json");
    const store = AppInfoStore.load(path);
    expect(store.size).toBe(0);
    store.set(10, { type: "game", icon: "i", clientIcon: "c" });
    store.save();
    expect(AppInfoStore.load(path).get(10)).toMatchObject({ type: "game", icon: "i", clientIcon: "c" });
    expect(AppInfoStore.load(path).isFresh(10)).toBe(true);

    writeFileSync(path, "sentinel");
    const again = AppInfoStore.load(path); // corrupt -> empty
    again.save(); // nothing changed -> no write
    expect(readFileSync(path, "utf8")).toBe("sentinel");
  });

  it("ignores files from other versions and malformed entries", () => {
    const path = join(makeTempDir(), "c.json");
    writeFileSync(path, JSON.stringify({ version: 99, apps: { 1: { type: "game" } } }));
    expect(AppInfoStore.load(path).size).toBe(0);
    writeFileSync(
      path,
      JSON.stringify({ version: 1, apps: { 1: { type: "game" }, x: { type: "game" }, 2: { icon: "no type" }, 3: { checkedAt: 5 } } }),
    );
    const store = AppInfoStore.load(path);
    expect(store.size).toBe(2); // 1 (typed) and 3 (unknown, with a check time)
    expect(store.isFresh(1)).toBe(false); // no checkedAt: re-check on next scan
  });

  it("retains only the given apps", () => {
    const store = AppInfoStore.memory();
    store.set(1, { type: "game" });
    store.set(2, { type: "tool" });
    store.retain(new Set([2]));
    expect(store.get(1)).toBeUndefined();
    expect(store.get(2)?.type).toBe("tool");
  });
});

describe("scanning with an AppInfoStore", () => {
  function steam(apps: { appid: number; name: string; type?: string }[]) {
    const root = makeTempDir();
    for (const a of apps) {
      writeFile(join(root, `steamapps/appmanifest_${a.appid}.acf`), manifest({ appid: a.appid, name: a.name, installdir: a.name }));
    }
    writeFile(
      join(root, "appcache/appinfo.vdf"),
      writeAppinfo(
        apps.map((a) => {
          const common: { [key: string]: KvValue } = a.type ? { name: a.name, type: a.type, icon: `icon${a.appid}` } : { name: a.name };
          return { appid: a.appid, kv: { appinfo: { common } } };
        }),
        29,
      ),
    );
    return root;
  }

  it("doesn't read appinfo.vdf once every installed app is known", () => {
    const root = steam([
      { appid: 1, name: "Game", type: "Game" },
      { appid: 2, name: "Proton 9.0", type: "Tool" },
    ]);
    const store = AppInfoStore.memory();
    expect(scanSteamInstall({ root, kind: "native" }, { appInfo: store }).games.map((g) => g.title)).toEqual(["Game"]);

    rmSync(join(root, "appcache/appinfo.vdf"));
    const second = scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    expect(second.games.map((g) => g.title)).toEqual(["Game"]);
    expect(second.games[0]?.steam?.type).toBe("game");
    expect(second.warnings).toEqual([]); // the missing file was never needed
  });

  it("looks up newly installed apps, and re-checks entries after 30 days", () => {
    const root = steam([{ appid: 1, name: "Game", type: "Game" }]);
    let now = Date.now();
    const store = AppInfoStore.memory({ now: () => now });
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });

    // A new install, and changed icon data for the existing one.
    writeFile(join(root, "steamapps/appmanifest_3.acf"), manifest({ appid: 3, name: "New", installdir: "New" }));
    writeFile(
      join(root, "appcache/appinfo.vdf"),
      writeAppinfo(
        [
          { appid: 1, kv: { appinfo: { common: { name: "Game", type: "Game", icon: "changed" } } } },
          { appid: 3, kv: { appinfo: { common: { name: "New", type: "Game" } } } },
        ],
        29,
      ),
    );
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    expect(store.get(3)?.type).toBe("game");
    expect(store.get(1)?.icon).toBe("icon1"); // still fresh: not re-read

    now += RECHECK_AFTER_MS + 1;
    expect(store.isFresh(1)).toBe(false);
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    expect(store.get(1)?.icon).toBe("changed");
    expect(store.isFresh(1)).toBe(true);
  });

  it("keeps using expired entries, without warning, when appinfo.vdf is unreadable", () => {
    const root = steam([{ appid: 1, name: "Proton 9.0", type: "Tool" }]);
    let now = Date.now();
    const store = AppInfoStore.memory({ now: () => now });
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    rmSync(join(root, "appcache/appinfo.vdf"));
    now += RECHECK_AFTER_MS + 1;
    const result = scanSteamInstall({ root, kind: "native" }, { appInfo: store, includeTools: true });
    expect(result.games[0]?.steam?.isTool).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("remembers apps Steam has no type for, so appinfo.vdf isn't re-read every open, and re-checks them daily", () => {
    const root = steam([{ appid: 5, name: "Fresh" }]);
    let now = Date.now();
    const store = AppInfoStore.memory({ now: () => now });
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    expect(store.get(5)).toEqual({ checkedAt: now });
    expect(store.isFresh(5)).toBe(true);

    // Steam has since fetched the app's info; it's picked up after a day, not before.
    writeFile(join(root, "appcache/appinfo.vdf"), writeAppinfo([{ appid: 5, kv: { appinfo: { common: { type: "Game" } } } }], 29));
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    expect(store.get(5)?.type).toBeUndefined();
    now += RECHECK_UNKNOWN_AFTER_MS + 1;
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    expect(store.get(5)?.type).toBe("game");
  });

  it("keeps known info when appinfo.vdf no longer lists an app", () => {
    const root = steam([{ appid: 6, name: "Old", type: "Game" }]);
    let now = Date.now();
    const store = AppInfoStore.memory({ now: () => now });
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    writeFile(join(root, "appcache/appinfo.vdf"), writeAppinfo([], 29));
    now += RECHECK_AFTER_MS + 1;
    scanSteamInstall({ root, kind: "native" }, { appInfo: store });
    expect(store.get(6)).toMatchObject({ type: "game", checkedAt: now });
  });

  it("scanLibrary persists the store and forgets uninstalled apps only after a complete scan", () => {
    const root = steam([
      { appid: 1, name: "Keep", type: "Game" },
      { appid: 2, name: "Gone", type: "Game" },
    ]);
    const cachePath = join(makeTempDir(), "appinfo-cache.json");
    const home = makeTempDir(); // no auto-detected installs, only the fake one
    scanLibrary({ steamPath: root, appInfoCachePath: cachePath, home });
    expect(AppInfoStore.load(cachePath).size).toBe(2);

    rmSync(join(root, "steamapps/appmanifest_2.acf"));
    // A missing library folder makes the scan partial: nothing is forgotten.
    writeFile(join(root, "steamapps/libraryfolders.vdf"), libraryFolders([root, "/nonexistent/lib"]));
    expect(scanLibrary({ steamPath: root, appInfoCachePath: cachePath, home }).steamComplete).toBe(false);
    expect(AppInfoStore.load(cachePath).get(2)).toBeDefined();

    writeFile(join(root, "steamapps/libraryfolders.vdf"), libraryFolders([root]));
    expect(scanLibrary({ steamPath: root, appInfoCachePath: cachePath, home }).steamComplete).toBe(true);
    expect(AppInfoStore.load(cachePath).get(2)).toBeUndefined();
    expect(AppInfoStore.load(cachePath).get(1)).toBeDefined();
  });
});
