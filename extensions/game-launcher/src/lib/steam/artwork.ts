import { type Dirent, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GameArtwork } from "../games";

/**
 * Steam's local artwork cache has had several layouts:
 *   - legacy flat:   appcache/librarycache/<appid>_library_600x900.jpg
 *   - per-app dir:   appcache/librarycache/<appid>/library_600x900.jpg
 *   - hashed subdir: appcache/librarycache/<appid>/<sha1>/library_capsule.jpg
 * The per-app layouts can be mixed within one install, so we index whatever
 * files exist under the app's directory (two levels deep) by name.
 *
 * Custom artwork set in the Steam client (e.g. from SteamGridDB) lives in
 * userdata/<account>/config/grid/ and takes precedence.
 */

const ART_NAMES = {
  portrait: ["library_600x900.jpg", "library_600x900.png", "library_capsule.jpg", "library_capsule.png"],
  header: ["library_header.jpg", "library_header.png", "header.jpg", "header.png"],
  hero: ["library_hero.jpg", "library_hero.png"],
  logo: ["logo.png", "logo.jpg"],
} as const;

/** name -> file. `mtimeMs` is only looked up when two files with the same name compete. */
type FileIndex = Map<string, { path: string; mtimeMs?: number }>;

const IMAGE = /\.(jpe?g|png)$/i;

/** Directory entries with their types (one syscall, no per-file stat). */
function listEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

const isFileLike = (e: Dirent) => e.isFile() || e.isSymbolicLink();

function mtime(entry: { path: string; mtimeMs?: number }): number {
  if (entry.mtimeMs === undefined) entry.mtimeMs = statSync(entry.path, { throwIfNoEntry: false })?.mtimeMs ?? 0;
  return entry.mtimeMs;
}

function addToIndex(index: FileIndex, name: string, path: string): void {
  const prev = index.get(name);
  if (!prev) {
    index.set(name, { path });
    return;
  }
  // The same asset in several hashed folders: the newest one is current.
  const next = { path };
  if (mtime(next) > mtime(prev)) index.set(name, next);
}

function indexAppDir(appDir: string): FileIndex {
  const index: FileIndex = new Map();
  for (const entry of listEntries(appDir)) {
    const full = join(appDir, entry.name);
    if (isFileLike(entry) && IMAGE.test(entry.name)) {
      addToIndex(index, entry.name, full);
    } else if (entry.isDirectory()) {
      for (const nested of listEntries(full)) {
        if (isFileLike(nested) && IMAGE.test(nested.name)) addToIndex(index, nested.name, join(full, nested.name));
      }
    }
  }
  return index;
}

function pick(index: FileIndex, names: readonly string[]): string | undefined {
  for (const n of names) {
    const hit = index.get(n);
    if (hit) return hit.path;
  }
  return undefined;
}

/** Index of the legacy flat layout: one directory listing, shared by all apps. */
export function indexLegacyLibraryCache(libraryCacheDir: string): FileIndex {
  const index: FileIndex = new Map();
  for (const entry of listEntries(libraryCacheDir)) {
    if (isFileLike(entry) && /^\d+_.+\.(jpe?g|png)$/i.test(entry.name)) {
      addToIndex(index, entry.name, join(libraryCacheDir, entry.name));
    }
  }
  return index;
}

/** Index of custom grid art across all Steam accounts: <appid>p.png, <appid>.png, <appid>_hero.png, ... */
export function indexCustomGrid(gridDirs: readonly string[]): FileIndex {
  const index: FileIndex = new Map();
  for (const dir of gridDirs) {
    for (const entry of listEntries(dir)) {
      if (isFileLike(entry) && /^\d+(p|_hero|_logo|_icon)?\.(jpe?g|png|webp)$/i.test(entry.name)) {
        addToIndex(index, entry.name.replace(/\.(jpe?g|png|webp)$/i, "").toLowerCase(), join(dir, entry.name));
      }
    }
  }
  return index;
}

export interface ArtworkContext {
  libraryCacheDir: string;
  /** <steam root>/steam/games, where Steam caches client .ico files. */
  clientIconDir: string;
  clientIcons: Set<string>;
  legacyIndex: FileIndex;
  customGrid: FileIndex;
}

/** File names in <steam root>/steam/games (client .ico files), listed once per scan. */
export function indexClientIcons(clientIconDir: string): Set<string> {
  return new Set(listEntries(clientIconDir).filter(isFileLike).map((e) => e.name));
}

/** Steam's cached copy of an app's client .ico (only present once a desktop shortcut was created). */
export function findClientIco(ctx: ArtworkContext, clientIconHash: string): string | undefined {
  const name = `${clientIconHash}.ico`;
  return ctx.clientIcons.has(name) ? join(ctx.clientIconDir, name) : undefined;
}

function compact(art: GameArtwork): GameArtwork {
  return Object.fromEntries(Object.entries(art).filter(([, v]) => v !== undefined)) as GameArtwork;
}

export interface LocalArtwork {
  /** Best local art per kind: custom grid art if set, else Steam's cached (1x) store art. */
  artwork: GameArtwork;
  /** The subset of `artwork` that is user-chosen custom grid art (always shown, never replaced by downloads). */
  custom: GameArtwork;
}

/**
 * Local artwork for an app. `icon` here is the 32x32 community icon; sharper
 * icons come from the client .ico via the artwork cache.
 */
export function findLocalArtwork(ctx: ArtworkContext, appid: number, iconHash?: string): LocalArtwork {
  const app = indexAppDir(join(ctx.libraryCacheDir, String(appid)));
  const legacy = (names: readonly string[]) => pick(ctx.legacyIndex, names.map((n) => `${appid}_${n}`));
  const customArt = (suffix: string) => ctx.customGrid.get(`${appid}${suffix}`)?.path;
  const byHash = (hash: string | undefined) => (hash ? (app.get(`${hash}.jpg`)?.path ?? app.get(`${hash}.png`)?.path) : undefined);
  // Without appinfo we don't know the hash, but the only hash-named image at the top of the app dir is the icon.
  const anyHashIcon = () => [...app.entries()].find(([name, f]) => /^[0-9a-f]{40}\.jpg$/.test(name) && f.path.endsWith(`/${appid}/${name}`))?.[1].path;

  const custom = compact({
    portrait: customArt("p"),
    header: customArt(""),
    hero: customArt("_hero"),
    logo: customArt("_logo"),
    icon: customArt("_icon"),
  });
  const steam = compact({
    portrait: pick(app, ART_NAMES.portrait) ?? legacy(ART_NAMES.portrait),
    header: pick(app, ART_NAMES.header) ?? legacy(ART_NAMES.header),
    hero: pick(app, ART_NAMES.hero) ?? legacy(ART_NAMES.hero),
    logo: pick(app, ART_NAMES.logo) ?? legacy(ART_NAMES.logo),
    icon: byHash(iconHash) ?? legacy(["icon.jpg", "icon.png"]) ?? anyHashIcon(),
  });
  return { artwork: { ...steam, ...custom }, custom };
}
