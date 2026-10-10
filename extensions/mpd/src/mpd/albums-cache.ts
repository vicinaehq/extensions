import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { Album } from '../util/albums.js';
import { cacheDir } from './albumart-paths.js';

export interface AlbumsSnapshot {
  // Epoch millis of MPD's `stats.dbUpdate` at write time. Used to detect when
  // the persisted snapshot is still authoritative — if MPD reports the same
  // value we can skip the refetch entirely.
  dbUpdate: number | undefined;
  albums: Album[];
}

// Sibling of the art cache directory. We put the album-list snapshot one
// level up so removing the art cache (which can get large) doesn't also
// invalidate the much-cheaper album list, and vice versa.
export function albumsCachePath(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  const art = cacheDir(env);
  return join(dirname(art), 'albums.json');
}

interface SerializedAlbum {
  name: string;
  artist: string;
  year?: string;
  totalDuration: number;
  songCount: number;
  sampleUri: string;
  // Stored as ISO string so the file is human-readable and re-parsable.
  lastModified: string;
}

interface SerializedSnapshot {
  dbUpdate: number | null;
  albums: SerializedAlbum[];
}

function isSerializedSnapshot(v: unknown): v is SerializedSnapshot {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (!('dbUpdate' in o) || !('albums' in o)) return false;
  if (!Array.isArray(o.albums)) return false;
  return true;
}

export function readAlbumsCache(path: string): AlbumsSnapshot | null {
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isSerializedSnapshot(parsed)) return null;
  const albums: Album[] = [];
  for (const a of parsed.albums) {
    if (!a || typeof a !== 'object') continue;
    if (typeof a.name !== 'string') continue;
    albums.push({
      name: a.name,
      artist: a.artist,
      year: a.year,
      totalDuration: a.totalDuration,
      songCount: a.songCount,
      sampleUri: a.sampleUri,
      lastModified: new Date(a.lastModified),
    });
  }
  return {
    dbUpdate: typeof parsed.dbUpdate === 'number' ? parsed.dbUpdate : undefined,
    albums,
  };
}

export function writeAlbumsCache(path: string, snap: AlbumsSnapshot): void {
  const serialized: SerializedSnapshot = {
    dbUpdate: snap.dbUpdate ?? null,
    albums: snap.albums.map((a) => ({
      name: a.name,
      artist: a.artist,
      year: a.year,
      totalDuration: a.totalDuration,
      songCount: a.songCount,
      sampleUri: a.sampleUri,
      lastModified: a.lastModified.toISOString(),
    })),
  };
  mkdirSync(dirname(path), { recursive: true });
  // Write to a temp sibling then rename — POSIX rename is atomic, so readers
  // never observe a half-written file (which would be very common otherwise
  // because writing the JSON for a few thousand albums takes a few ms).
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(serialized));
  renameSync(tmp, path);
}
