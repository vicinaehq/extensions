import { LocalStorage } from '@vicinae/api';
import { createHash } from 'node:crypto';

export const FAVICON_CACHE_KEY = 'vicinae-bitwarden-favicons';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export type FaviconMap = Record<string, string>;

interface CacheEntry {
  dataUri: string;
  timestamp: number;
}

let faviconCache: Record<string, CacheEntry> = {};

export async function loadFaviconCache(): Promise<FaviconMap> {
  try {
    const raw = await LocalStorage.getItem<string>(FAVICON_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function persistFaviconCache(): Promise<void> {
  const map: FaviconMap = {};
  for (const [domain, entry] of Object.entries(faviconCache)) {
    if (entry.dataUri) map[domain] = entry.dataUri;
  }
  await LocalStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(map));
}

// Try loading persisted favicon cache on module init
void (async () => {
  const saved = await loadFaviconCache();
  for (const [domain, uri] of Object.entries(saved)) {
    faviconCache[domain] = { dataUri: uri, timestamp: Date.now() };
  }
})();

// Google's globe placeholder — same 16x16 PNG regardless of sz param
const GLOBE_MD5 = 'b8a0bf372c762e966cc99ede8682bc71';

function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function isGlobeFavicon(buf: Buffer, status: number): boolean {
  if (status === 404) return true;
  const size = readPngSize(buf);
  if (size && size.width <= 16) return true;
  const hash = createHash('md5').update(buf).digest('hex');
  return hash === GLOBE_MD5;
}

export async function resolveFavicons(domains: string[]): Promise<FaviconMap> {
  const now = Date.now();
  const unique = [...new Set(domains)].filter((d) => {
    const entry = faviconCache[d];
    return !entry || now - entry.timestamp > CACHE_TTL;
  });
  if (unique.length === 0) {
    return Object.fromEntries(Object.entries(faviconCache).map(([k, v]) => [k, v.dataUri]));
  }

  await Promise.all(
    unique.map(async (domain) => {
      const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          faviconCache[domain] = { dataUri: '', timestamp: now };
          return;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (isGlobeFavicon(buf, res.status)) {
          faviconCache[domain] = { dataUri: '', timestamp: now };
          return;
        }
        const mime = res.headers.get('content-type') ?? 'image/png';
        const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
        faviconCache[domain] = { dataUri, timestamp: now };
      } catch {
        faviconCache[domain] = { dataUri: '', timestamp: now };
      }
    }),
  );

  await persistFaviconCache();
  return Object.fromEntries(Object.entries(faviconCache).map(([k, v]) => [k, v.dataUri]));
}

export function clearFaviconCache(): void {
  faviconCache = {};
}
