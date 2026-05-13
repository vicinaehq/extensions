import { LocalStorage, environment } from '@vicinae/api';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const FAVICON_CACHE_KEY = 'vicinae-bitwarden-favicons';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export type FaviconMap = Record<string, string>;

interface CacheEntry {
  dataUri: string;
  timestamp: number;
}

let faviconCache: Record<string, CacheEntry> = {};

function isCacheEntry(value: unknown): value is CacheEntry {
  return typeof value === 'object' && value !== null && 'dataUri' in value && 'timestamp' in value;
}

function hydrateEntry(domain: string, value: unknown, result: FaviconMap): void {
  if (isCacheEntry(value)) {
    const entry = value;
    // Legacy: entries stored as file paths need converting to data URIs
    if (entry.dataUri.startsWith('/')) {
      try {
        entry.dataUri = fileToDataUri(entry.dataUri);
      } catch {
        entry.dataUri = '';
        entry.timestamp = 0;
      }
    }
    result[domain] = entry.dataUri;
    if (!faviconCache[domain]) {
      faviconCache[domain] = entry;
    }
  } else if (typeof value === 'string') {
    // Old plain-string format — treat as stale so it gets replaced
    result[domain] = value;
    if (!faviconCache[domain]) {
      faviconCache[domain] = { dataUri: value, timestamp: 0 };
    }
  }
}

export async function loadFaviconCache(): Promise<FaviconMap> {
  try {
    const raw = await LocalStorage.getItem<string>(FAVICON_CACHE_KEY);
    if (!raw) return {};
    const parsed: Record<string, unknown> = JSON.parse(raw);
    const result: FaviconMap = {};
    for (const [domain, value] of Object.entries(parsed)) {
      hydrateEntry(domain, value, result);
    }
    return result;
  } catch {
    return {};
  }
}

async function persistFaviconCache(): Promise<void> {
  const map: Record<string, CacheEntry> = {};
  for (const [domain, entry] of Object.entries(faviconCache)) {
    if (entry.dataUri) map[domain] = entry;
  }
  await LocalStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(map));
}

// Pre-warm the in-memory cache on module init
void loadFaviconCache();

export function extractHostname(uris?: { uri: string }[]): string | null {
  if (!uris?.length) return null;
  for (const u of uris) {
    if (!u.uri) continue;
    try {
      const urlString = /^https?:\/\//.test(u.uri) ? u.uri : `https://${u.uri}`;
      return new URL(urlString).hostname;
    } catch {
      continue;
    }
  }
  return null;
}

function faviconDir(): string {
  return join(environment.supportPath, 'favicons');
}

function ensureFaviconDir(): void {
  const dir = faviconDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Google's globe placeholder — same 16x16 PNG regardless of sz param
const GLOBE_MD5 = 'b8a0bf372c762e966cc99ede8682bc71';

function isGlobeFavicon(buf: Buffer, status: number): boolean {
  if (status === 404) return true;
  if (buf.length < 24) return false;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return false;
  const width = buf.readUInt32BE(16);
  if (width <= 16) return true;
  const hash = createHash('md5').update(buf).digest('hex');
  return hash === GLOBE_MD5;
}

// iOS-style corner radius ratio. Vicinae has no native cornerRadius prop, so
// we mask the corners into the PNG bytes once at fetch (and on cold-disk hit
// for icons cached before this change), then everything renders pre-rounded.
const CORNER_RADIUS_RATIO = 0.22;

function roundPngCorners(buf: Buffer): Buffer {
  let png: PNG;
  try {
    png = PNG.sync.read(buf);
  } catch {
    return buf; // not decodable — hand back the original bytes
  }
  const { width, height, data } = png;
  const radius = Math.max(1, Math.round(Math.min(width, height) * CORNER_RADIUS_RATIO));

  const maskCorner = (
    cx: number,
    cy: number,
    xRange: [number, number],
    yRange: [number, number],
  ) => {
    for (let y = yRange[0]; y < yRange[1]; y++) {
      for (let x = xRange[0]; x < xRange[1]; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius - 0.5) continue;
        const idx = (y * width + x) * 4 + 3;
        if (dist >= radius + 0.5) {
          data[idx] = 0;
        } else {
          // 1px antialiased band
          const factor = radius + 0.5 - dist;
          data[idx] = Math.round(data[idx] * factor);
        }
      }
    }
  };
  maskCorner(radius, radius, [0, radius], [0, radius]);
  maskCorner(width - radius, radius, [width - radius, width], [0, radius]);
  maskCorner(radius, height - radius, [0, radius], [height - radius, height]);
  maskCorner(width - radius, height - radius, [width - radius, width], [height - radius, height]);
  return PNG.sync.write(png);
}

function fileToDataUri(filePath: string): string {
  const buf = readFileSync(filePath);
  const rounded = roundPngCorners(buf);
  return `data:image/png;base64,${rounded.toString('base64')}`;
}

function resolveDomain(domain: string, now: number, result: FaviconMap): boolean {
  const entry = faviconCache[domain];
  const filePath = join(faviconDir(), `${encodeURIComponent(domain)}.png`);

  // In-memory cache hit
  if (entry && entry.dataUri && now - entry.timestamp <= CACHE_TTL) {
    if (existsSync(filePath)) {
      result[domain] = entry.dataUri;
      return true;
    }
    // File deleted since last cache — fall through to re-download
  }

  // Cold hit: file exists on disk from previous session
  if (existsSync(filePath)) {
    try {
      const mtime = statSync(filePath).mtimeMs;
      if (now - mtime <= CACHE_TTL) {
        const dataUri = fileToDataUri(filePath);
        result[domain] = dataUri;
        faviconCache[domain] = { dataUri, timestamp: mtime };
        return true;
      }
    } catch {
      // stale or unreadable — re-download
    }
  }

  return false;
}

/**
 * Fetch a fresh favicon from Google, write it to disk, and cache as a data URI.
 * Returns a data URI on success, empty string on failure.
 */
async function fetchAndWrite(domain: string, filePath: string, now: number): Promise<string> {
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      faviconCache[domain] = { dataUri: '', timestamp: now };
      return '';
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (isGlobeFavicon(buf, res.status)) {
      faviconCache[domain] = { dataUri: '', timestamp: now };
      return '';
    }
    const rounded = roundPngCorners(buf);
    writeFileSync(filePath, rounded);
    const dataUri = `data:image/png;base64,${rounded.toString('base64')}`;
    faviconCache[domain] = { dataUri, timestamp: now };
    return dataUri;
  } catch {
    faviconCache[domain] = { dataUri: '', timestamp: now };
    return '';
  }
}

// Cap concurrent network fetches: Google's favicon service times out under
// burst load (we hit ~5% timeouts at ~50 parallel requests, more above that).
const MAX_CONCURRENT_FETCHES = 8;

export async function resolveFavicons(domains: string[]): Promise<FaviconMap> {
  const now = Date.now();
  ensureFaviconDir();
  const result: FaviconMap = {};
  const unique = [...new Set(domains)];

  // First pass: resolve everything we can from cache/disk synchronously.
  const toFetch: string[] = [];
  for (const domain of unique) {
    if (!resolveDomain(domain, now, result)) toFetch.push(domain);
  }

  // Second pass: fetch the rest with bounded concurrency.
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_FETCHES, toFetch.length) },
    async () => {
      while (cursor < toFetch.length) {
        const domain = toFetch[cursor++];
        const filePath = join(faviconDir(), `${encodeURIComponent(domain)}.png`);
        const dataUri = await fetchAndWrite(domain, filePath, now);
        if (dataUri) result[domain] = dataUri;
      }
    },
  );
  await Promise.all(workers);

  // Prune entries for domains no longer in the vault. Mirrors how
  // saveCachedVault overwrites the items list — domains deleted from
  // Bitwarden drop out of the favicon cache on next sync instead of
  // accumulating forever.
  if (unique.length > 0) {
    const requested = new Set(unique);
    for (const domain of Object.keys(faviconCache)) {
      if (requested.has(domain)) continue;
      delete faviconCache[domain];
      try {
        unlinkSync(join(faviconDir(), `${encodeURIComponent(domain)}.png`));
      } catch {
        // file already gone or never existed — nothing to do
      }
    }
  }

  await persistFaviconCache();
  return result;
}

export function clearFaviconCache(): void {
  faviconCache = {};
}
