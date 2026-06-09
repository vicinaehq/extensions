import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { mimeToExt, CACHE_EXTS } from './albumart-paths.js';

// Stream icons can come from three sources. We cache each in its own slot so
// they never collide on disk and a stronger source can coexist with (and win
// over) a weaker one across sessions. Order = priority, highest first.
export const STREAM_ART_SOURCES = ['embedded', 'webradiodb', 'favicon'] as const;
export type StreamArtSource = (typeof STREAM_ART_SOURCES)[number];

export function streamArtCachePath(
  dir: string,
  uri: string,
  source: StreamArtSource,
  mime: string | undefined,
): string {
  const hash = createHash('sha1').update(uri).digest('hex');
  return join(dir, `${hash}.${source}.${mimeToExt(mime)}`);
}

// Return the cached icon for a stream URI, choosing the highest-priority
// source that has a file on disk. O(sources * exts) existsSync probes — no
// readdir scan. Returns null when the dir is absent or nothing is cached.
export function findStreamArt(
  dir: string,
  uri: string,
): { path: string; source: StreamArtSource } | null {
  if (!existsSync(dir)) return null;
  const hash = createHash('sha1').update(uri).digest('hex');
  for (const source of STREAM_ART_SOURCES) {
    for (const ext of CACHE_EXTS) {
      const p = join(dir, `${hash}.${source}.${ext}`);
      if (existsSync(p)) return { path: p, source };
    }
  }
  return null;
}
