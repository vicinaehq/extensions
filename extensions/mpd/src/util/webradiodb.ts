import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cacheDir } from '../mpd/albumart-paths.js';
import { streamArtCachePath } from '../mpd/stream-art-paths.js';
import { isValidImage } from './image-validate.js';

// WebradioDB (https://github.com/jcorporation/webradiodb) is a curated,
// community webradio image database used by myMPD. Images live at a
// deterministic GitHub Pages URL keyed by a sanitized stream URI, so we can
// fetch one with a plain GET and no API/exact-match negotiation. A 404 means
// "not in the curated DB" and we fall through to other sources.

export const WEBRADIODB_BASE = 'https://jcorporation.github.io/webradiodb/db/pics';
export const WEBRADIODB_TIMEOUT_MS = 3000;
export const USER_AGENT = 'vicinae-mpd/0.1.0';

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const defaultFetch: FetchLike = ((input, init) =>
  fetch(input as string, init)) as FetchLike;
let fetchImpl: FetchLike = defaultFetch;

export function _setFetchForTests(fn: FetchLike | null): void {
  fetchImpl = fn ?? defaultFetch;
}
export function _resetForTests(): void {
  fetchImpl = defaultFetch;
}

// Replace exactly the character set WebradioDB uses for its filenames.
export function sanitizeStreamUri(uri: string): string {
  return uri.replace(/[<>/.:?&$%!#\\|;=]/g, '_');
}

export function webradioDbPicUrl(uri: string): string {
  return `${WEBRADIODB_BASE}/${sanitizeStreamUri(uri)}.webp`;
}

// GET the curated webp, validate the bytes, and cache into the webradiodb
// slot. Returns the on-disk path or null (404 / invalid / network / timeout).
export async function downloadWebradioDbPicture(
  streamUri: string,
): Promise<string | null> {
  const dir = cacheDir(process.env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBRADIODB_TIMEOUT_MS);
  try {
    const res = await fetchImpl(webradioDbPicUrl(streamUri), {
      headers: { 'user-agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isValidImage(buf, contentType)) return null;
    const path = streamArtCachePath(dir, streamUri, 'webradiodb', 'image/webp');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buf);
    return path;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
