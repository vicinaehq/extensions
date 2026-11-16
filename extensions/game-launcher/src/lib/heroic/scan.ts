/**
 * The Heroic launcher integration. Heroic keeps one installed-games list per store backend
 * (legendary for Epic, gog, nile for Amazon, zoom) plus sideloaded apps, and its own play time,
 * favorites, hidden list and custom categories, all as JSON files in its config folder. Launching
 * uses Heroic's URL handler (heroic://launch?appName=<id>&runner=<runner>), like its own shortcuts.
 *
 * Artwork: Heroic stores icons in icons/<appName>.(jpg|png) and caches the images its UI showed in
 * images-cache/, named by the SHA-256 of the image URL. Store art URLs are kept on the game too,
 * so the artwork cache can download sharper copies (see artwork-requests).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import {
  acronyms,
  type Game,
  type GameArtwork,
  type GameCollection,
  heroicGameId,
  type HeroicRef,
  type LauncherScan,
} from "../games";
import { findHeroicInstalls, type HeroicInstall } from "./paths";

export interface HeroicScanOptions {
  /** Heroic Folder preference (the config folder containing config.json): when set, only it is used. */
  heroicPath?: string;
  /** Home directory to auto-detect installs in (tests). */
  home?: string;
}

export interface HeroicLauncherScan extends LauncherScan {
  launcher: "heroic";
  /**
   * Every game in Heroic's installed lists, including any left out of `games` (e.g. one with no
   * known title), so their cached art survives pruning.
   */
  installed: HeroicRef[];
}

interface StoreInfo {
  /** The same store's Lutris service id, so copies in both launchers match (see Game.storeIds). */
  storeId?: string;
  keywords: string[];
}

/** Heroic's store backends ("runners"). */
export const HEROIC_STORES: Record<string, StoreInfo> = {
  legendary: { storeId: "egs", keywords: ["epic", "egs"] },
  gog: { storeId: "gog", keywords: ["gog"] },
  nile: { storeId: "amazon", keywords: ["amazon"] },
  zoom: { storeId: "zoomplatform", keywords: ["zoom"] },
  sideload: { keywords: [] },
};

export function heroicLaunchUri(runner: string, appName: string): string {
  return `heroic://launch?appName=${encodeURIComponent(appName)}&runner=${encodeURIComponent(runner)}`;
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** A store's installed game, before it becomes a Game. */
interface InstalledEntry {
  runner: string;
  appName: string;
  title?: string;
  installPath?: string;
  platform?: string;
  sizeBytes?: number;
}

/** What Heroic's library caches know about a game (title and store art). */
interface LibraryEntry {
  title?: string;
  art: Partial<Record<"art_square" | "art_cover" | "art_background" | "art_logo" | "art_icon", string>>;
}

const ART_FIELDS = ["art_square", "art_cover", "art_background", "art_logo", "art_icon"] as const;

class Reader {
  readonly warnings: string[] = [];
  /** False once an installed-games list (what decides which games' cached art is kept) couldn't be read. */
  complete = true;

  constructor(private readonly root: string) {}

  path(rel: string): string {
    return join(this.root, rel);
  }

  /** Parsed JSON, or undefined if the file doesn't exist. Unreadable files are warned about. */
  json(rel: string, what: string, critical: boolean): unknown {
    const path = this.path(rel);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      return this.fail(path, what, err, critical);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (err) {
      return this.fail(path, what, err, critical);
    }
  }

  private fail(path: string, what: string, err: unknown, critical: boolean): undefined {
    if (critical) this.complete = false;
    this.warnings.push(`Couldn't read Heroic's ${what} at ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

function libraryEntries(value: unknown, key: string): unknown[] {
  const list = isObject(value) ? value[key] : undefined;
  return Array.isArray(list) ? list : [];
}

/**
 * Titles and art URLs from Heroic's per-store library caches, keyed by "<runner>:<appName>". They're
 * the only source of some games' titles (e.g. third-party Epic installs), so a game may be left out
 * without them, but the scan stays complete: which games' art is kept comes from the installed lists.
 * Sideloaded apps have no separate cache: their library (already read) is the installed list too.
 */
function readLibraries(r: Reader, sideloaded: unknown): Map<string, LibraryEntry> {
  const read = (file: string, what: string, key: string) => libraryEntries(r.json(`store_cache/${file}`, what, false), key);
  const sources: [runner: string, entries: unknown[]][] = [
    ["legendary", read("legendary_library.json", "Epic library", "library")],
    ["gog", read("gog_library.json", "GOG library", "games")],
    ["nile", read("nile_library.json", "Amazon library", "library")],
    ["zoom", read("zoom_library.json", "ZOOM library", "games")],
    ["sideload", libraryEntries(sideloaded, "games")],
  ];
  const map = new Map<string, LibraryEntry>();
  for (const [runner, entries] of sources) {
    for (const g of entries) {
      if (!isObject(g)) continue;
      const appName = str(g.app_name);
      if (!appName) continue;
      const art: LibraryEntry["art"] = {};
      for (const f of ART_FIELDS) {
        const v = str(g[f]);
        if (v) art[f] = v;
      }
      map.set(`${runner}:${appName}`, { title: str(g.title), art });
    }
  }
  return map;
}

/** Powers of 1024 by unit prefix. */
const SIZE_POWERS: Record<string, number> = { "": 0, k: 1, m: 2, g: 3, t: 4 };

/**
 * Bytes from a byte count, or from the text Heroic writes for GOG and ZOOM installs. Heroic always
 * measures in powers of 1024, labelled "3.37 GiB" now and "3.37 GB" by older versions.
 */
export function sizeOf(v: unknown): number | undefined {
  if (typeof v === "number") return v > 0 ? v : undefined;
  if (typeof v !== "string") return undefined;
  // A bare number is a byte count only when it's whole: "3.37" alone is more likely a truncated "3.37 GiB".
  const m = /^\s*(?:(\d+)|([\d.]+)\s*(?:([kmgt]?)i?b|bytes?))\s*$/i.exec(v);
  const bytes = !m ? NaN : m[1] ? Number(m[1]) : Number(m[2]) * 1024 ** SIZE_POWERS[(m[3] ?? "").toLowerCase()]!;
  return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : undefined;
}

/** Installed games from every store backend Heroic supports. DLC is left out. */
function readInstalled(r: Reader, sideloaded: unknown): InstalledEntry[] {
  const out: InstalledEntry[] = [];

  // Epic (legendary): an object keyed by app name.
  const legendary = r.json("legendaryConfig/legendary/installed.json", "Epic installed games", true);
  if (isObject(legendary)) {
    for (const g of Object.values(legendary)) {
      if (!isObject(g) || g.is_dlc === true) continue;
      const appName = str(g.app_name);
      if (appName) {
        out.push({
          runner: "legendary",
          appName,
          title: str(g.title),
          installPath: str(g.install_path),
          platform: str(g.platform),
          sizeBytes: sizeOf(g.install_size),
        });
      }
    }
  }
  // Epic games installed through a third-party client (EA app, Ubisoft Connect): [[appName, platform], ...].
  const thirdParty = r.json("legendaryConfig/legendary/third-party-installed.json", "third-party Epic games", true);
  if (Array.isArray(thirdParty)) {
    for (const entry of thirdParty) {
      const appName = Array.isArray(entry) ? str(entry[0]) : undefined;
      if (appName && !out.some((g) => g.runner === "legendary" && g.appName === appName)) {
        out.push({ runner: "legendary", appName, platform: Array.isArray(entry) ? str(entry[1]) : undefined });
      }
    }
  }

  // GOG and ZOOM: {"installed": [{appName, install_path, platform, ...}]}.
  for (const [runner, file] of [
    ["gog", "gog_store/installed.json"],
    ["zoom", "zoom_store/installed.json"],
  ] as const) {
    for (const g of libraryEntries(r.json(file, `${runner} installed games`, true), "installed")) {
      if (!isObject(g) || g.is_dlc === true) continue;
      const appName = str(g.appName);
      if (appName) {
        out.push({ runner, appName, installPath: str(g.install_path), platform: str(g.platform), sizeBytes: sizeOf(g.install_size) });
      }
    }
  }

  // Amazon (nile): [{id, path, size, ...}].
  const nile = r.json("nile_config/nile/installed.json", "Amazon installed games", true);
  if (Array.isArray(nile)) {
    for (const g of nile) {
      const appName = isObject(g) ? str(g.id) : undefined;
      if (appName && isObject(g)) out.push({ runner: "nile", appName, installPath: str(g.path), sizeBytes: sizeOf(g.size) });
    }
  }

  // Sideloaded apps: the library itself, with an installed flag.
  for (const g of libraryEntries(sideloaded, "games")) {
    if (!isObject(g) || g.is_installed !== true) continue;
    const appName = str(g.app_name);
    const install = isObject(g.install) ? g.install : {};
    const folder = str(g.folder_name);
    if (appName) {
      out.push({
        runner: "sideload",
        appName,
        title: str(g.title),
        installPath: folder && isAbsolute(folder) ? folder : undefined,
        platform: str(install.platform),
      });
    }
  }
  return out;
}

/** The first of Heroic's image-cache entries for this URL: the UI caches Epic art resized, others as-is. */
function cachedImage(root: string, url: string): string | undefined {
  for (const variant of [`${url}?h=400&resize=1&w=300`, `${url}?h=800&resize=1&w=600`, url]) {
    const path = join(root, "images-cache", createHash("sha256").update(variant).digest("hex"));
    if (existsSync(path)) return path;
  }
  return undefined;
}

/** A local image: an absolute path or file:// URL that exists. */
function localImage(ref: string): string | undefined {
  let path = ref;
  if (ref.startsWith("file://")) {
    const raw = ref.slice("file://".length);
    try {
      path = decodeURIComponent(raw);
    } catch {
      path = raw; // not escaped after all (e.g. a literal "%" in the file name)
    }
  }
  return isAbsolute(path) && existsSync(path) ? path : undefined;
}

const KIND_FIELDS: [keyof GameArtwork, keyof LibraryEntry["art"]][] = [
  ["portrait", "art_square"],
  ["header", "art_cover"],
  ["hero", "art_background"],
  ["logo", "art_logo"],
  ["icon", "art_icon"],
];

function artworkFor(root: string, appName: string, lib: LibraryEntry | undefined) {
  const local: GameArtwork = {};
  const urls: GameArtwork = {};
  for (const [kind, field] of KIND_FIELDS) {
    const ref = lib?.art[field];
    if (!ref) continue;
    if (/^https?:\/\//.test(ref)) {
      urls[kind] = ref;
      const cached = cachedImage(root, ref);
      if (cached) local[kind] = cached;
    } else {
      const path = localImage(ref);
      if (path) local[kind] = path;
    }
  }
  const icon = ["jpg", "png"].map((ext) => join(root, "icons", `${appName}.${ext}`)).find((p) => existsSync(p));
  if (icon) local.icon = icon;
  return { local, urls };
}

interface PlayData {
  lastPlayed: number;
  playtimeMinutes?: number;
}

/** Heroic's play time store: {appName: {lastPlayed: ISO date, totalPlayed: minutes}}. */
function readPlayData(r: Reader): Map<string, PlayData> {
  const map = new Map<string, PlayData>();
  const data = r.json("store/timestamp.json", "play time", false);
  if (!isObject(data)) return map;
  for (const [appName, v] of Object.entries(data)) {
    if (!isObject(v)) continue;
    const last = typeof v.lastPlayed === "string" ? Date.parse(v.lastPlayed) : NaN;
    const minutes = typeof v.totalPlayed === "number" && v.totalPlayed > 0 ? Math.round(v.totalPlayed) : undefined;
    map.set(appName, { lastPlayed: Number.isFinite(last) && last > 0 ? Math.floor(last / 1000) : 0, playtimeMinutes: minutes });
  }
  return map;
}

function toGame(root: string, entry: InstalledEntry, lib: LibraryEntry | undefined, play: PlayData | undefined): Game | undefined {
  const title = lib?.title ?? entry.title ?? (entry.installPath ? basename(entry.installPath) : undefined);
  if (!title) return undefined;
  const store = HEROIC_STORES[entry.runner];
  const { local, urls } = artworkFor(root, entry.appName, lib);
  return {
    id: heroicGameId(entry.runner, entry.appName),
    source: "heroic",
    title,
    launchUri: heroicLaunchUri(entry.runner, entry.appName),
    installDir: entry.installPath,
    sizeOnDisk: entry.sizeBytes,
    lastPlayed: play?.lastPlayed ?? 0,
    playtimeMinutes: play?.playtimeMinutes,
    artwork: local,
    keywords: [...acronyms(title), ...(store?.keywords ?? [])],
    storeIds: store?.storeId ? [`${store.storeId}:${entry.appName}`] : [],
    heroic: { appName: entry.appName, runner: entry.runner, platform: entry.platform, artUrls: urls },
  };
}

/** Heroic's favorites, hidden list and custom categories (store/config.json, under "games"). */
function readLibraryState(r: Reader) {
  const before = r.warnings.length;
  const config = r.json("store/config.json", "settings", false);
  const ok = r.warnings.length === before;
  const state = isObject(config) && isObject(config.games) ? config.games : {};
  // Favorites and the hidden list record only the app name, not the store, so an entry stands for
  // that app in every store. Uninstalled games are included, like the other launchers' hidden lists,
  // so a "shown here" choice survives an uninstall and reinstall.
  const idsFor = (list: unknown) =>
    (Array.isArray(list) ? list : []).flatMap((e) => {
      const appName = isObject(e) ? str(e.appName) : undefined;
      return appName ? Object.keys(HEROIC_STORES).map((runner) => heroicGameId(runner, appName)) : [];
    });

  const hidden = new Set(idsFor(state.hidden));
  const collections: GameCollection[] = [];
  const favorites = idsFor(state.favourites);
  if (favorites.length) {
    collections.push({ id: "heroic:favorites", name: "Favorites", source: "heroic", kind: "favorites", gameIds: new Set(favorites) });
  }
  const categories = isObject(state.customCategories) ? state.customCategories : {};
  for (const name of Object.keys(categories).sort((a, b) => a.localeCompare(b))) {
    const members = categories[name];
    // Entries are "<appName>_<runner>"; runner names have no underscore, app names might.
    const gameIds = (Array.isArray(members) ? members : []).flatMap((m) => {
      const i = typeof m === "string" ? m.lastIndexOf("_") : -1;
      return i > 0 ? [heroicGameId((m as string).slice(i + 1), (m as string).slice(0, i))] : [];
    });
    collections.push({ id: `heroic:category:${name}`, name, source: "heroic", kind: "user", gameIds: new Set(gameIds) });
  }
  return { hidden, collections, ok };
}

function scanInstall(install: HeroicInstall) {
  const r = new Reader(install.configDir);
  const sideloaded = r.json("sideload_apps/library.json", "sideloaded apps", true);
  const installed = readInstalled(r, sideloaded);
  const libraries = readLibraries(r, sideloaded);
  const play = readPlayData(r);
  const games: Game[] = [];
  for (const entry of installed) {
    const game = toGame(install.configDir, entry, libraries.get(`${entry.runner}:${entry.appName}`), play.get(entry.appName));
    if (game) games.push(game);
    else r.warnings.push(`Skipped Heroic game ${entry.appName} (${entry.runner}): neither its installed list nor its library cache has a title.`);
  }
  const state = readLibraryState(r);
  return {
    games,
    installed: installed.map(({ runner, appName }) => ({ runner, appName })),
    ...state,
    warnings: r.warnings,
    complete: r.complete,
  };
}

/**
 * Scan Heroic. Only one install is used (the Heroic Folder setting, else the first found: native,
 * then Flatpak), since the heroic:// URL reaches only one of them; other installs are just noted.
 */
export function scanHeroic(options: HeroicScanOptions = {}): HeroicLauncherScan {
  const [install, ...others] = findHeroicInstalls({ override: options.heroicPath, home: options.home });
  const result: HeroicLauncherScan = {
    launcher: "heroic",
    found: Boolean(install),
    sources: [],
    games: [],
    installed: [],
    collections: [],
    hiddenInLauncher: new Set(),
    hiddenListComplete: Boolean(install),
    complete: Boolean(install),
    warnings: [],
    settingsProblem:
      options.heroicPath?.trim() && !install
        ? `The Heroic Folder setting doesn't point at a Heroic config folder (no config.json and store/): ${options.heroicPath.trim()}`
        : undefined,
  };
  if (!install) return result;

  for (const other of others) {
    result.warnings.push(
      `Also found Heroic (${other.kind}) at ${other.configDir}; only the ${install.kind} install is used. ` +
        "Set the Heroic Folder setting to use a different one.",
    );
  }
  result.sources.push(`Heroic (${install.kind}): ${install.configDir}`);
  const scanned = scanInstall(install);
  result.games = scanned.games;
  result.installed = scanned.installed;
  result.collections = scanned.collections;
  result.hiddenInLauncher = scanned.hidden;
  // Hidden entries come from store/config.json alone (see readLibraryState), not from the installed lists.
  result.hiddenListComplete = scanned.ok;
  result.complete = scanned.complete;
  result.warnings.push(...scanned.warnings);
  return result;
}
