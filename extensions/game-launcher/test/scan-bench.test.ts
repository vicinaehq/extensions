/**
 * Scan performance against synthetic large Steam installs. Skipped unless BENCH=1:
 *
 *   BENCH=1 pnpm exec vitest run scan-bench --silent=false
 *
 * Files are freshly written, so they're in the OS page cache: numbers are
 * "warm disk". A truly cold first read after boot will be slower, dominated by
 * reading appinfo.vdf.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { AppInfoStore } from "../src/lib/steam/appinfo-store";
import { readActivity, readAppInfo, readLibraryFolders, readManifests, scanSteamInstall } from "../src/lib/steam/library";
import { type KvValue, writeAppinfo } from "./fixtures/appinfo-writer";
import { libraryFolders, localConfig, makeTempDir, manifest, writeFile } from "./fixtures/fake-steam";

interface Size {
  label: string;
  installed: number;
  /** Total apps in appinfo.vdf (the client caches far more apps than are installed). */
  appinfoApps: number;
  /** Padding per appinfo entry; real entries carry depots, launch configs, localisation, etc. */
  appinfoBytesPerApp: number;
  /** Apps with play history in localconfig.vdf. */
  playedApps: number;
}

const SIZES: Size[] = [
  { label: "large", installed: 500, appinfoApps: 20_000, appinfoBytesPerApp: 2_500, playedApps: 3_000 },
  { label: "huge", installed: 2_000, appinfoApps: 60_000, appinfoBytesPerApp: 2_500, playedApps: 10_000 },
];

function buildSteam(size: Size): string {
  const root = makeTempDir("gl-bench-");
  const lib2 = makeTempDir("gl-bench-lib-");
  writeFile(join(root, "steamapps/libraryfolders.vdf"), libraryFolders([root, lib2]));

  for (let i = 0; i < size.installed; i++) {
    const appid = 10_000 + i;
    const lib = i % 2 ? lib2 : root;
    writeFile(join(lib, `steamapps/appmanifest_${appid}.acf`), manifest({ appid, name: `Game ${appid}`, installdir: `G${appid}`, SizeOnDisk: 1e9 }));
    // Mixed artwork layouts, like a real librarycache.
    const art = join(root, "appcache/librarycache", String(appid));
    writeFile(join(art, `${"a".repeat(40)}.jpg`));
    writeFile(join(art, `${"b".repeat(40)}/library_capsule.jpg`));
    writeFile(join(art, `${"c".repeat(40)}/library_header.jpg`));
    writeFile(join(art, `${"d".repeat(40)}/library_hero.jpg`));
    writeFile(join(art, `${"d".repeat(40)}/library_hero_blur.jpg`));
    writeFile(join(art, `${"e".repeat(40)}/logo.png`));
  }

  const pad = "x".repeat(size.appinfoBytesPerApp);
  const apps: { appid: number; kv: { [key: string]: KvValue } }[] = [];
  for (let i = 0; i < size.appinfoApps; i++) {
    const appid = 10_000 + i;
    apps.push({
      appid,
      kv: { appinfo: { appid, common: { name: `Game ${appid}`, type: i >= size.installed && i % 10 === 0 ? "dlc" : "game", icon: "a".repeat(40) }, extended: { blob: pad } } },
    });
  }
  writeFile(join(root, "appcache/appinfo.vdf"), writeAppinfo(apps, 29));

  const played: Record<number, { LastPlayed: number; Playtime: number }> = {};
  for (let i = 0; i < size.playedApps; i++) played[10_000 + i] = { LastPlayed: 1_790_000_000 + i, Playtime: i };
  writeFile(join(root, "userdata/1/config/localconfig.vdf"), localConfig(played));
  return root;
}

describe.runIf(process.env.BENCH === "1")("scan benchmark", () => {
  it.each(SIZES)("$label: $installed installed, $appinfoApps apps in appinfo.vdf", (size) => {
    const root = buildSteam(size);
    const install = { root, kind: "native" as const };

    const t0 = performance.now();
    const first = scanSteamInstall(install);
    const firstMs = performance.now() - t0;

    const avg = (fn: () => unknown, runs = 5) => {
      const t = performance.now();
      for (let i = 0; i < runs; i++) fn();
      return (performance.now() - t) / runs;
    };
    const total = avg(() => scanSteamInstall(install));
    const store = AppInfoStore.memory();
    scanSteamInstall(install, { appInfo: store });
    const warm = avg(() => scanSteamInstall(install, { appInfo: store }));
    const ids = new Set(readLibraryFolders(root).paths.flatMap((l) => readManifests(l).manifests).map((m) => m.appid));
    const phases = {
      manifests: avg(() => readLibraryFolders(root).paths.flatMap((l) => readManifests(l).manifests)),
      appinfo: avg(() => readAppInfo(root, ids)),
      "appinfo (read only)": avg(() => readFileSync(join(root, "appcache/appinfo.vdf"))),
      localconfig: avg(() => readActivity(root)),
    };
    const known = phases.manifests + phases.appinfo + phases.localconfig;

    const mb = (p: string) => (statSync(join(root, p)).size / 1e6).toFixed(0);
    console.log(
      `\n${size.label}: ${first.games.length} games · appinfo.vdf ${mb("appcache/appinfo.vdf")} MB · ` +
        `localconfig.vdf ${mb("userdata/1/config/localconfig.vdf")} MB\n` +
        `  first scan ${firstMs.toFixed(0)} ms, then avg ${total.toFixed(0)} ms without the appinfo store, ` +
        `${warm.toFixed(0)} ms with it\n` +
        Object.entries(phases)
          .map(([k, v]) => `    ${k.padEnd(20)} ${v.toFixed(1)} ms`)
          .join("\n") +
        `\n    ${"artwork + rest".padEnd(20)} ${(total - known).toFixed(1)} ms`,
    );
    expect(first.games).toHaveLength(size.installed);
  }, 120_000);
});
