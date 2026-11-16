import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { acronyms, type Game, type GameCollection } from "../games";
import { getNumber, getObject, getString, parseVdf, type VdfObject } from "../vdf/text";
import { type AppInfo, parseAppInfo } from "./appinfo";
import { AppInfoStore } from "./appinfo-store";
import { readSteamCollections } from "./collections";
import {
  type ArtworkContext,
  findClientIco,
  findLocalArtwork,
  indexClientIcons,
  indexCustomGrid,
  indexLegacyLibraryCache,
} from "./artwork";
import { safeRealpath, type SteamInstall } from "./paths";

/** AppState.StateFlags bit meaning the app is fully installed (it may also need an update). */
export const STATE_FULLY_INSTALLED = 4;

/**
 * Timestamps below this are placeholders, not real plays. Steam writes values
 * such as 86400 for apps it has never launched.
 */
const MIN_VALID_TIMESTAMP = 946684800; // 2000-01-01

/** Fallback filter for when appinfo.vdf can't be read. */
const KNOWN_TOOL_APPIDS = new Set([
  228980, // Steamworks Common Redistributables
  1070560, // Steam Linux Runtime 1.0 (scout)
  1391110, // Steam Linux Runtime 2.0 (soldier)
  1628350, // Steam Linux Runtime 3.0 (sniper)
  1493710, // Proton Experimental
  2180100, // Proton Hotfix
  1826330, // Proton EasyAntiCheat Runtime
  1161040, // Proton BattlEye Runtime
]);
const TOOL_NAME_PATTERN = /^(Proton\b|Steam Linux Runtime\b|Steamworks Common Redistributables|Steamworks SDK Redist)/i;

/** App types that count as "games". Everything else (tool, config, dlc, music, ...) is a tool. */
const GAME_TYPES = new Set(["game", "demo", "application", "beta"]);

export interface SteamManifest {
  appid: number;
  name: string;
  installDir: string;
  libraryPath: string;
  stateFlags: number;
  sizeOnDisk?: number;
  lastPlayed?: number;
}

export interface SteamActivity {
  lastPlayed: number;
  playtimeMinutes: number;
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function readVdfFile(path: string): VdfObject | undefined {
  const text = readText(path);
  if (text === undefined) return undefined;
  try {
    return parseVdf(text);
  } catch {
    return undefined;
  }
}

/**
 * Library folder paths from libraryfolders.vdf. Handles both the current
 * format ("0" { "path" "..." }) and the pre-2021 one ("1" "/path").
 * The Steam root itself is always included.
 */
export function readLibraryFolders(steamRoot: string): string[] {
  const doc =
    readVdfFile(join(steamRoot, "steamapps/libraryfolders.vdf")) ?? readVdfFile(join(steamRoot, "config/libraryfolders.vdf"));
  const folders = getObject(doc, "libraryfolders");
  const paths: string[] = [steamRoot];
  if (folders) {
    for (const [key, value] of Object.entries(folders)) {
      if (!/^\d+$/.test(key)) continue;
      const path = typeof value === "string" ? value : getString(value, "path");
      if (path) paths.push(path);
    }
  }
  // Resolve symlinks before de-duplicating: on Fedora Atomic /home -> /var/home, so the same
  // library can be listed under both spellings.
  return [...new Set(paths.map((p) => safeRealpath(p.replace(/\/+$/, ""))))];
}

export function parseManifest(text: string, libraryPath: string): SteamManifest | undefined {
  let doc: VdfObject;
  try {
    doc = parseVdf(text);
  } catch {
    return undefined;
  }
  const state = getObject(doc, "AppState");
  const appid = getNumber(state, "appid");
  const name = getString(state, "name");
  const installDir = getString(state, "installdir");
  if (!appid || !name || !installDir) return undefined;
  return {
    appid,
    name,
    installDir,
    libraryPath,
    stateFlags: getNumber(state, "StateFlags") ?? 0,
    sizeOnDisk: getNumber(state, "SizeOnDisk"),
    lastPlayed: getNumber(state, "LastPlayed"),
  };
}

export function readManifests(libraryPath: string): SteamManifest[] {
  const steamapps = join(libraryPath, "steamapps");
  let entries: string[];
  try {
    entries = readdirSync(steamapps);
  } catch {
    return [];
  }
  const out: SteamManifest[] = [];
  for (const entry of entries) {
    if (!/^appmanifest_\d+\.acf$/.test(entry)) continue;
    const text = readText(join(steamapps, entry));
    const manifest = text === undefined ? undefined : parseManifest(text, libraryPath);
    if (manifest) out.push(manifest);
  }
  return out;
}

export function userDataDirs(steamRoot: string): string[] {
  const base = join(steamRoot, "userdata");
  try {
    return readdirSync(base)
      .filter((d) => /^\d+$/.test(d) && d !== "0")
      .map((d) => join(base, d));
  } catch {
    return [];
  }
}

/**
 * Last-played time and playtime per app, merged across every Steam account on
 * this machine (taking the most recent / largest value).
 */
export function parseLocalConfigActivity(doc: VdfObject | undefined, into = new Map<number, SteamActivity>()) {
  const apps = getObject(doc, "UserLocalConfigStore", "Software", "Valve", "Steam", "apps");
  if (!apps) return into;
  for (const [key, value] of Object.entries(apps)) {
    if (typeof value !== "object" || !/^\d+$/.test(key)) continue;
    const appid = Number(key);
    const lastPlayed = getNumber(value, "LastPlayed") ?? 0;
    const playtime = getNumber(value, "Playtime") ?? 0;
    const prev = into.get(appid);
    into.set(appid, {
      lastPlayed: Math.max(prev?.lastPlayed ?? 0, lastPlayed >= MIN_VALID_TIMESTAMP ? lastPlayed : 0),
      playtimeMinutes: Math.max(prev?.playtimeMinutes ?? 0, playtime),
    });
  }
  return into;
}

export function readActivity(steamRoot: string): Map<number, SteamActivity> {
  const activity = new Map<number, SteamActivity>();
  for (const dir of userDataDirs(steamRoot)) {
    parseLocalConfigActivity(readVdfFile(join(dir, "config/localconfig.vdf")), activity);
  }
  return activity;
}

export function readAppInfo(steamRoot: string, appids: ReadonlySet<number>): Map<number, AppInfo> | undefined {
  try {
    return parseAppInfo(readFileSync(join(steamRoot, "appcache/appinfo.vdf")), appids);
  } catch {
    return undefined;
  }
}

export function isTool(manifest: SteamManifest, info: { type?: string } | undefined): boolean {
  if (info?.type) return !GAME_TYPES.has(info.type);
  return KNOWN_TOOL_APPIDS.has(manifest.appid) || TOOL_NAME_PATTERN.test(manifest.name);
}

export interface ScanOptions {
  includeTools?: boolean;
  /** Remembered appinfo.vdf data; only apps missing from it (or expired) are looked up in appinfo.vdf. */
  appInfo?: AppInfoStore;
}

export interface SteamScanResult {
  install: SteamInstall;
  games: Game[];
  /** Every app with a manifest on disk: tools filtered out of `games` and apps mid-update included. */
  installedAppids: number[];
  /** False when a library folder was missing (e.g. an unmounted drive), so the list may be partial. */
  complete: boolean;
  /** Non-fatal problems worth surfacing (e.g. appinfo.vdf unreadable). */
  warnings: string[];
  /** Favorites and static user collections. */
  collections: GameCollection[];
  /** Games in Steam's own Hidden collection. */
  hiddenInLauncher: Set<string>;
  /** Dynamic (rule-based) Steam collections that aren't supported. */
  dynamicCollectionsSkipped: number;
  /** False if Steam's collections file couldn't be read; `hiddenInLauncher` may then be incomplete. */
  collectionsComplete: boolean;
}

/** Scan one Steam install for installed games. */
export function scanSteamInstall(install: SteamInstall, options: ScanOptions = {}): SteamScanResult {
  const warnings: string[] = [];
  const manifests = new Map<number, SteamManifest>();
  // Every app with a manifest on disk, including ones mid-update or mid-download (no FullyInstalled
  // bit). They aren't listed, but they are installed: their cached art and appinfo must survive pruning.
  const onDisk = new Set<number>();
  let complete = true;
  for (const lib of readLibraryFolders(install.root)) {
    // Check steamapps/, not the folder itself: an unmounted drive often leaves an empty mount point behind.
    // The Steam root is exempt: it may legitimately have no steamapps/ when every game is on other drives.
    if (lib !== install.root && !existsSync(join(lib, "steamapps"))) {
      warnings.push(`Steam library folder not found (drive not mounted?): ${lib}`);
      complete = false;
      continue;
    }
    for (const m of readManifests(lib)) {
      onDisk.add(m.appid);
      if ((m.stateFlags & STATE_FULLY_INSTALLED) === 0) continue;
      // The same app can appear in two libraries mid-move; keep the first seen.
      if (!manifests.has(m.appid)) manifests.set(m.appid, m);
    }
  }

  const store = options.appInfo ?? AppInfoStore.memory();
  const wanted = new Set([...manifests.keys()].filter((id) => !store.isFresh(id)));
  if (wanted.size > 0) {
    const parsed = readAppInfo(install.root, wanted);
    // Expired entries are still usable, so only warn when an app has no type at all.
    if (!parsed && [...wanted].some((id) => !store.get(id)?.type)) {
      warnings.push("Could not read Steam's appinfo.vdf; using built-in rules to hide Steam tools.");
    }
    if (parsed) {
      for (const id of wanted) {
        const info = parsed.get(id);
        if (info?.type) store.set(id, { type: info.type, icon: info.icon, clientIcon: info.clientIcon });
        // Not in appinfo.vdf, or no type yet: remember that we looked, so the (large) file
        // isn't re-read on every open. Unknown entries are re-checked sooner than known ones.
        else store.markChecked(id);
      }
    }
  }
  const activity = readActivity(install.root);

  const artCtx: ArtworkContext = {
    libraryCacheDir: join(install.root, "appcache/librarycache"),
    clientIconDir: join(install.root, "steam/games"),
    clientIcons: indexClientIcons(join(install.root, "steam/games")),
    legacyIndex: indexLegacyLibraryCache(join(install.root, "appcache/librarycache")),
    customGrid: indexCustomGrid(userDataDirs(install.root).map((d) => join(d, "config/grid"))),
  };

  const games: Game[] = [];
  for (const m of manifests.values()) {
    const info = store.get(m.appid);
    const tool = isTool(m, info);
    if (tool && !options.includeTools) continue;

    const act = activity.get(m.appid);
    const manifestPlayed = m.lastPlayed && m.lastPlayed >= MIN_VALID_TIMESTAMP ? m.lastPlayed : 0;
    const local = findLocalArtwork(artCtx, m.appid, info?.icon);
    games.push({
      id: `steam:${m.appid}`,
      source: "steam",
      title: m.name,
      launchUri: `steam://rungameid/${m.appid}`,
      installDir: join(m.libraryPath, "steamapps/common", m.installDir),
      sizeOnDisk: m.sizeOnDisk,
      lastPlayed: Math.max(act?.lastPlayed ?? 0, manifestPlayed),
      playtimeMinutes: act?.playtimeMinutes,
      artwork: local.artwork,
      customArtwork: local.custom,
      keywords: [...acronyms(m.name), String(m.appid), m.installDir],
      storeIds: [`steam:${m.appid}`],
      steam: {
        appid: m.appid,
        type: info?.type,
        isTool: tool,
        clientIcon: info?.clientIcon,
        localIco: info?.clientIcon ? findClientIco(artCtx, info.clientIcon) : undefined,
      },
    });
  }
  const steamCollections = readSteamCollections(userDataDirs(install.root));
  const toIds = (appids: Iterable<number>) => new Set([...appids].map((id) => `steam:${id}`));
  const collections: GameCollection[] = [
    ...(steamCollections.favorites ? [steamCollections.favorites] : []),
    ...steamCollections.user,
  ].map((c) => ({
    id: `steam:${c.id}`,
    name: c.name,
    source: "steam" as const,
    kind: c.id === "favorite" ? ("favorites" as const) : ("user" as const),
    gameIds: toIds(c.appids),
  }));

  return {
    install,
    games,
    installedAppids: [...onDisk],
    complete,
    warnings,
    collections,
    hiddenInLauncher: toIds(steamCollections.hidden),
    dynamicCollectionsSkipped: steamCollections.dynamicSkipped,
    collectionsComplete: steamCollections.ok,
  };
}
