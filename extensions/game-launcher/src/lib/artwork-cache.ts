/**
 * On-disk cache of high-resolution artwork.
 *
 * Steam: the local librarycache holds 1x art (300x450 covers, 460x215 banners, 32x32 icons), which
 * looks soft on HiDPI screens. The CDN serves 2x variants for most apps, and each app's client .ico
 * often contains icons up to 512px.
 *
 * Heroic: it keeps only small copies of the store art its UI showed, so the full images are
 * downloaded from the store art URLs in its library (see UrlArtworkRequest).
 *
 * Layout:
 *   <dir>/steam/<appid>/
 *     portrait@2x.jpg, header@2x.jpg  2x CDN art (preferred)
 *     portrait@1x.jpg, header@1x.jpg  1x CDN art, only fetched when Steam has no local copy
 *     icon.png                        largest image from the client .ico, only kept if >= 64px
 *     <kind>.missing                  marker: nothing acceptable was available at that time
 *   <dir>/heroic/<runner>/<app name, URL-encoded>/
 *     <kind>-<url hash>.<ext>         the image at the art URL; a new URL (updated store art) is a new file
 *     <kind>-<url hash>.missing       marker: that URL had no image at that time
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type HeroicRef, heroicGameId } from "./games";
import { extractLargestIcon } from "./image/ico";

const CACHED_KINDS = ["portrait", "header", "hero", "logo", "icon"] as const;
export type CachedKind = (typeof CACHED_KINDS)[number];
/** The kinds Steam's CDN has 2x art for (its hero and logo art is already full size locally). */
type ImageKind = "portrait" | "header";
/** Kinds this cache keeps for Steam apps: CDN images and the icon from the client .ico. */
export type SteamKind = ImageKind | "icon";
const LAUNCHER_DIRS = ["steam", "heroic"] as const;
const IMAGE_EXTS = ["jpg", "png", "webp", "gif"];

const CDN = "https://cdn.cloudflare.steamstatic.com";
/** Icons smaller than this are no sharper than Steam's local 32px icon. */
export const MIN_SHARP_ICON = 64;
/** Re-download cached art after this long so updated store art eventually shows up. */
const REFRESH_AFTER_MS = 30 * 24 * 3600 * 1000;
/** Retry failed / missing downloads after this long. */
const RETRY_MISSING_AFTER_MS = 7 * 24 * 3600 * 1000;
/** Temp files older than this are leftovers from an interrupted write. */
const STALE_TMP_MS = 3600 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const CDN_NAMES: Record<ImageKind, { "2x": string; "1x": string }> = {
  portrait: { "2x": "library_600x900_2x.jpg", "1x": "library_600x900.jpg" },
  header: { "2x": "library_header_2x.jpg", "1x": "header.jpg" },
};

/** Every file name the cache writes, for pruning anything else (old layouts, junk). */
const KNOWN_FILES = new Set([
  "portrait@2x.jpg",
  "portrait@1x.jpg",
  "header@2x.jpg",
  "header@1x.jpg",
  "icon.png",
  "portrait.missing",
  "header.missing",
  "icon.missing",
]);

export function cdnUrl(appid: number, kind: ImageKind, scale: "2x" | "1x"): string {
  return `${CDN}/steam/apps/${appid}/${CDN_NAMES[kind][scale]}`;
}

export function clientIconUrl(appid: number, hash: string): string {
  return `${CDN}/steamcommunity/public/images/apps/${appid}/${hash}.ico`;
}

/** Downloaded art for a Steam app. */
export interface SteamArtworkRequest {
  appid: number;
  kind: SteamKind;
  /**
   * Whether the launcher already has a local copy of this kind (Steam's 1x
   * art). If so, only a 2x download is worth having; a 1x download would just
   * duplicate it.
   */
  hasLocal?: boolean;
  /** For icons: the appinfo clienticon hash. */
  clientIcon?: string;
  /** For icons: a local copy of the .ico (Steam keeps one in steam/games/ once a shortcut exists). */
  localIco?: string;
}

/** The image at a store art URL, for a Heroic game (its runner and app name). */
export interface UrlArtworkRequest extends HeroicRef {
  kind: CachedKind;
  url: string;
}

export type ArtworkRequest = SteamArtworkRequest | UrlArtworkRequest;

export function isUrlRequest(req: ArtworkRequest): req is UrlArtworkRequest {
  return "url" in req;
}

/** Which game's art a request is for: "steam:<appid>" or the Heroic game id. Downloaded art is looked up by this. */
export function artKeyOf(req: ArtworkRequest): string {
  return isUrlRequest(req) ? heroicGameId(req.runner, req.appName) : `steam:${req.appid}`;
}

/** A name as one path segment: URL-encoded, and never "." or ".." (which encodeURIComponent keeps). */
function pathSegment(name: string): string {
  const encoded = encodeURIComponent(name);
  return /^\.+$/.test(encoded) ? encoded.replace(/\./g, "%2E") : encoded;
}

/** Folder of a Heroic game's art, relative to the cache root (gog + 12 -> heroic/gog/12). */
function heroicGameDir(owner: HeroicRef): string {
  return join("heroic", pathSegment(owner.runner), pathSegment(owner.appName));
}

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

/** File extension for a downloaded image, from its content type, else its URL. */
function extensionFor(type: string, url: string): string {
  const fromType: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/jpeg": "jpg" };
  const known = fromType[type.split(";")[0]!.trim().toLowerCase()];
  if (known) return known;
  const fromUrl = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
  return fromUrl === "jpeg" ? "jpg" : fromUrl && IMAGE_EXTS.includes(fromUrl) ? fromUrl : "jpg";
}

/** Every file name the cache writes for a Heroic game, for pruning anything else. */
const HEROIC_FILE = new RegExp(`^(${CACHED_KINDS.join("|")})-[0-9a-f]{16}\\.(${[...IMAGE_EXTS, "missing"].join("|")})$`);

export interface ArtworkCacheOptions {
  /** May be false to only use local .ico files and never touch the network. */
  allowNetwork: boolean;
  fetch?: typeof fetch;
  now?: () => number;
}

interface Downloaded {
  body: Buffer;
  type: string;
}

/** The response if it's a non-empty image. */
function asImage(res: Downloaded | undefined): Downloaded | undefined {
  if (!res) return undefined;
  const isImage = res.type.startsWith("image/") || res.type === "application/octet-stream" || res.type === "";
  return res.body.length > 0 && isImage ? res : undefined;
}

/** Thrown when a download finishes after the cache was cleared; its result is discarded. */
class StaleWriteError extends Error {}

export class ArtworkCache {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  /** Bumped by clear(): downloads that started before a clear don't write their results. */
  private epoch = 0;

  constructor(
    readonly dir: string,
    private readonly options: ArtworkCacheOptions,
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private appDir(appid: number): string {
    return join(this.dir, "steam", String(appid));
  }

  private file(appid: number, name: string): string {
    return join(this.appDir(appid), name);
  }

  private markerFor(appid: number, kind: CachedKind): string {
    return this.file(appid, `${kind}.missing`);
  }

  /** Where a URL request's image goes, without the extension. */
  private urlBase(req: UrlArtworkRequest): string {
    return join(this.dir, heroicGameDir(req), `${req.kind}-${urlHash(req.url)}`);
  }

  private ageMs(path: string): number | undefined {
    try {
      return this.now() - statSync(path).mtimeMs;
    } catch {
      return undefined;
    }
  }

  /**
   * Best cached file for this request, if any (even if due for a refresh).
   * For Steam, a cached 1x image is ignored when Steam has its own local copy.
   * Synchronous so it can be used while rendering.
   */
  get(req: ArtworkRequest): string | undefined {
    if (isUrlRequest(req)) {
      const base = this.urlBase(req);
      return IMAGE_EXTS.map((ext) => `${base}.${ext}`).find((p) => existsSync(p));
    }
    const { appid, kind, hasLocal } = req;
    const candidates = kind === "icon" ? ["icon.png"] : hasLocal ? [`${kind}@2x.jpg`] : [`${kind}@2x.jpg`, `${kind}@1x.jpg`];
    for (const name of candidates) {
      const path = this.file(appid, name);
      if (existsSync(path)) return path;
    }
    return undefined;
  }

  /** Whether `ensure` would do any work for this request. */
  needsFetch(req: ArtworkRequest): boolean {
    if (isUrlRequest(req)) {
      if (!this.options.allowNetwork) return false;
      const base = this.urlBase(req);
      const missingAge = this.ageMs(`${base}.missing`);
      if (missingAge !== undefined && missingAge <= RETRY_MISSING_AFTER_MS) return false;
      // The file is named after its URL, so there's nothing to refresh: updated store art has a new URL.
      return !this.get(req);
    }
    if (req.kind === "icon" && !req.clientIcon) return false;
    if (!this.options.allowNetwork && !(req.kind === "icon" && req.localIco && existsSync(req.localIco))) return false;
    const missingAge = this.ageMs(this.markerFor(req.appid, req.kind));
    if (missingAge !== undefined && missingAge <= RETRY_MISSING_AFTER_MS) return false;
    const cached = this.get(req);
    if (!cached) return true;
    // A 1x download is a stopgap for apps Steam had no art for: keep trying for 2x on the normal schedule.
    const age = this.ageMs(cached);
    return age === undefined || age > REFRESH_AFTER_MS;
  }

  /** Download (or extract) the artwork if needed. Resolves to the best cached path, or undefined if unavailable. */
  async ensure(req: ArtworkRequest): Promise<string | undefined> {
    if (!this.needsFetch(req)) return this.get(req);
    const epoch = this.epoch;
    try {
      if (isUrlRequest(req)) {
        await this.fetchUrl(req, epoch);
      } else {
        const saved = req.kind === "icon" ? await this.fetchIcon(req, epoch) : await this.fetchImage(req, req.kind, epoch);
        if (!saved) this.write(this.markerFor(req.appid, req.kind), Buffer.from(String(this.now())), epoch);
        else this.remove(this.markerFor(req.appid, req.kind));
      }
    } catch {
      // Network errors are transient (no marker, so we try again next time); a StaleWriteError means
      // the cache was cleared mid-download and the result was rightly dropped.
    }
    return this.get(req);
  }

  private async fetchUrl(req: UrlArtworkRequest, epoch: number): Promise<void> {
    const base = this.urlBase(req);
    // No image (404/403, or a 200 that isn't an image, like a store's "soft 404" or a captive portal's
    // page) is recorded like Steam's: retried after a week, so it isn't fetched on every open.
    const image = await this.download(req.url);
    const path = image ? `${base}.${extensionFor(image.type, req.url)}` : `${base}.missing`;
    this.write(path, image ? image.body : Buffer.from(String(this.now())), epoch);
    // Art from an older URL (and its markers) is superseded either way. This never removes art that's
    // on screen: a URL is only fetched when it has no file, so the old file could never show again.
    const dir = join(base, "..");
    const prefix = `${req.kind}-`;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(prefix) && join(dir, name) !== path && !name.endsWith(".tmp")) this.remove(join(dir, name));
    }
  }

  private async fetchImage(req: SteamArtworkRequest, kind: ImageKind, epoch: number): Promise<boolean> {
    const hi = await this.download(cdnUrl(req.appid, kind, "2x"));
    if (hi) {
      this.write(this.file(req.appid, `${kind}@2x.jpg`), hi.body, epoch);
      this.remove(this.file(req.appid, `${kind}@1x.jpg`)); // superseded
      return true;
    }
    // The 1x CDN image is the same as Steam's local copy, and worse than a 2x we already have
    // (a refresh that 404s keeps the old 2x and records the miss instead).
    if (req.hasLocal || existsSync(this.file(req.appid, `${kind}@2x.jpg`))) return false;
    const lo = await this.download(cdnUrl(req.appid, kind, "1x"));
    if (lo) this.write(this.file(req.appid, `${kind}@1x.jpg`), lo.body, epoch);
    return Boolean(lo);
  }

  private async fetchIcon(req: SteamArtworkRequest, epoch: number): Promise<boolean> {
    let ico: Buffer | undefined;
    if (req.localIco && existsSync(req.localIco)) ico = readFileSync(req.localIco);
    else if (this.options.allowNetwork && req.clientIcon) ico = (await this.download(clientIconUrl(req.appid, req.clientIcon)))?.body;
    if (!ico) return false;
    let icon;
    try {
      icon = extractLargestIcon(ico);
    } catch {
      return false;
    }
    if (!icon || icon.size < MIN_SHARP_ICON) return false;
    this.write(this.file(req.appid, "icon.png"), icon.png, epoch);
    return true;
  }

  /** The response at `url`, or undefined on 403/404. Throws on network errors and 5xx. */
  private async fetchBody(url: string): Promise<Downloaded | undefined> {
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404 || res.status === 403) return undefined;
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "" };
  }

  /** The image at `url`, or undefined on 403/404/non-image. Throws on network errors and 5xx. */
  private async download(url: string): Promise<Downloaded | undefined> {
    return asImage(await this.fetchBody(url));
  }

  /** Atomic write so a half-downloaded file is never rendered. Refuses writes from before a clear(). */
  private write(path: string, data: Buffer, epoch: number): void {
    if (epoch !== this.epoch) throw new StaleWriteError();
    mkdirSync(join(path, ".."), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  }

  private remove(path: string): void {
    try {
      unlinkSync(path);
    } catch {
      // already gone
    }
  }

  /** Number of files and bytes currently cached. */
  usage(): { files: number; bytes: number } {
    let files = 0;
    let bytes = 0;
    const walk = (dir: string) => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const path = join(dir, e.name);
        if (e.isDirectory()) walk(path);
        else if (!e.name.endsWith(".missing")) {
          files++;
          bytes += statSync(path, { throwIfNoEntry: false })?.size ?? 0;
        }
      }
    };
    for (const launcher of LAUNCHER_DIRS) walk(join(this.dir, launcher));
    return { files, bytes };
  }

  /** Delete everything this cache has downloaded or extracted, including "missing" markers. */
  clear(): { files: number; bytes: number } {
    this.epoch++;
    const usage = this.usage();
    for (const launcher of LAUNCHER_DIRS) rmSync(join(this.dir, launcher), { recursive: true, force: true });
    return usage;
  }

  /** Remove files a cache folder shouldn't have; temp files only once old (a download may be in flight). */
  private pruneFiles(dir: string, keep: (name: string) => boolean): number {
    let removed = 0;
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      return 0;
    }
    for (const name of files) {
      if (keep(name)) continue;
      const path = join(dir, name);
      if (name.endsWith(".tmp") && (this.ageMs(path) ?? Infinity) < STALE_TMP_MS) continue;
      rmSync(path, { recursive: true, force: true });
      removed++;
    }
    return removed;
  }

  /**
   * Delete cached Steam art for apps that are no longer installed, files from older
   * cache layouts, and stale temp files. Returns the number of entries removed.
   */
  prune(installedAppids: ReadonlySet<number>): number {
    const root = join(this.dir, "steam");
    let removed = 0;
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const appDir = join(root, entry);
      if (!/^\d+$/.test(entry) || !installedAppids.has(Number(entry))) {
        rmSync(appDir, { recursive: true, force: true });
        removed++;
        continue;
      }
      removed += this.pruneFiles(appDir, (name) => KNOWN_FILES.has(name));
    }
    return removed;
  }

  /** Like prune, for Heroic games. */
  pruneHeroic(installed: readonly HeroicRef[]): number {
    const keep = new Set(installed.map((g) => heroicGameDir(g)));
    const root = join(this.dir, "heroic");
    let removed = 0;
    let runners: string[];
    try {
      runners = readdirSync(root);
    } catch {
      return 0;
    }
    for (const runner of runners) {
      let games: string[];
      try {
        games = readdirSync(join(root, runner));
      } catch {
        rmSync(join(root, runner), { recursive: true, force: true });
        removed++;
        continue;
      }
      for (const entry of games) {
        const gameDir = join(root, runner, entry);
        if (!keep.has(join("heroic", runner, entry))) {
          rmSync(gameDir, { recursive: true, force: true });
          removed++;
          continue;
        }
        removed += this.pruneFiles(gameDir, (name) => HEROIC_FILE.test(name));
      }
    }
    return removed;
  }
}

/** Run `fn` over `items` with bounded concurrency. */
export async function forEachLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
