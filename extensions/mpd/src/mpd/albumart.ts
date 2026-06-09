import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { MPC } from 'mpc-js';
import { cachePathFor, cacheDir, CACHE_EXTS } from './albumart-paths.js';
import { streamArtCachePath, findStreamArt } from './stream-art-paths.js';
import { withClient } from './client.js';
import { withTimeout } from '../util/timeout.js';

export interface ArtSource {
  getPicture: (
    uri: string,
  ) => Promise<{ binary: ArrayBuffer; type: string } | undefined>;
  getAlbumArt: (
    uri: string,
  ) => Promise<{ binary: ArrayBuffer; type: string } | undefined>;
}

const memoryCache = new Map<string, string>();

// Negative cache for stream URIs we've already tried that returned no art
// (or timed out). Streams don't usually carry embedded pictures and we
// don't want to repeat the MPD round-trip on every queue refresh. This is
// process-scoped only; restarting the extension re-tries.
const streamArtNegativeCache = new Set<string>();

export function _resetMemoryCacheForTests(): void {
  memoryCache.clear();
  streamArtNegativeCache.clear();
}

// Probe the known set of cache extensions for ${hash}.{ext}. This replaces a
// readdirSync scan of the entire cache directory, which was O(entries) per
// lookup and dominated cold album-list rendering on libraries with thousands
// of cached covers.
export function findCachedArt(dir: string, uri: string): string | null {
  if (!existsSync(dir)) return null;
  const hash = createHash('sha1').update(uri).digest('hex');
  for (const ext of CACHE_EXTS) {
    const candidate = join(dir, `${hash}.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function fetchAlbumArt(
  source: ArtSource,
  uri: string,
  dir: string,
): Promise<string | null> {
  const cached = memoryCache.get(uri);
  if (cached) return cached;

  const onDisk = findCachedArt(dir, uri);
  if (onDisk) {
    memoryCache.set(uri, onDisk);
    return onDisk;
  }

  let picture: { binary: ArrayBuffer; type: string } | undefined;
  try {
    picture = await source.getPicture(uri);
  } catch {
    picture = undefined;
  }
  if (!picture) {
    try {
      picture = await source.getAlbumArt(uri);
    } catch {
      picture = undefined;
    }
  }
  if (!picture) return null;

  try {
    mkdirSync(dir, { recursive: true });
    const path = cachePathFor(dir, uri, picture.type);
    writeFileSync(path, Buffer.from(picture.binary));
    memoryCache.set(uri, path);
    return path;
  } catch {
    return null;
  }
}

// mpc-js's Picture exposes the bytes on `data` (not `binary`).
// We normalize to our internal { binary, type } shape so the cache logic stays uniform.
async function adaptPicture(
  p: { data: ArrayBuffer; type: string } | undefined,
): Promise<{ binary: ArrayBuffer; type: string } | undefined> {
  if (!p) return undefined;
  return { binary: p.data, type: p.type };
}

// Cache-only lookup. Returns a path if the URI's art is already on disk
// (or in the in-process memory cache), otherwise null. Crucially this never
// touches MPD — callers can use it to short-circuit large batch fetches and
// avoid paying the connect cost when everything is already cached.
export function lookupCachedArt(uri: string): string | null {
  const cached = memoryCache.get(uri);
  if (cached) return cached;
  const dir = cacheDir(process.env);
  const onDisk = findCachedArt(dir, uri);
  if (onDisk) {
    memoryCache.set(uri, onDisk);
    return onDisk;
  }
  return null;
}

function makeMpcSource(mpc: MPC): ArtSource {
  return {
    getPicture: async (u) =>
      adaptPicture(
        (await mpc.database.getPicture(u)) as
          | { data: ArrayBuffer; type: string }
          | undefined,
      ),
    getAlbumArt: async (u) =>
      adaptPicture(
        (await mpc.database.getAlbumArt(u)) as
          | { data: ArrayBuffer; type: string }
          | undefined,
      ),
  };
}

export async function fetchAlbumArtViaMpc(uri: string): Promise<string | null> {
  // Fast path: if the cache already has it, skip the MPD connection entirely.
  // This makes warm-cache repeat opens of the album list independent of MPD.
  const cached = lookupCachedArt(uri);
  if (cached) return cached;
  const dir = cacheDir(process.env);
  return withClient<string | null>(async (mpc: MPC) => {
    return fetchAlbumArt(makeMpcSource(mpc), uri, dir);
  });
}

// An "art session" represents an opened source plus the function to close it.
// Used by fetchAlbumArtBatch to abstract over MPD connection lifecycle so the
// loop can be tested without a real MPD.
export interface ArtSession {
  source: ArtSource;
  close: () => Promise<void>;
}

export interface FetchAlbumArtBatchOptions {
  uris: string[];
  dir: string;
  // Lazily opens a session — only invoked if at least one URI misses the cache.
  openSession: () => Promise<ArtSession>;
  // Streamed per cache-MISS, in completion order. Cache HITS are NOT streamed;
  // they're returned grouped on the resolved value so the UI can collapse them
  // into a single state update instead of paying one render per hit.
  onMiss: (uri: string, path: string | null) => void;
  // Max in-flight fetches against the source. Defaults to 4.
  concurrency?: number;
}

export interface FetchAlbumArtBatchResult {
  // All URIs that hit the disk/memory cache, mapped to their on-disk path.
  // Returned synchronously once the cache scan completes (before any MPD
  // round-trip), so the caller can perform one bulk setState for the warm
  // case rather than streaming N individual events.
  cached: Map<string, string>;
}

// Fetch album art for many URIs against a single shared session.
//
// Compared to calling fetchAlbumArtViaMpc once per URI this:
//   * opens at most ONE connection for the whole batch (vs. N connects)
//   * never opens any connection if every URI is cached
//   * deduplicates the input
//   * splits results into a synchronous-ish `cached` map (one batch) and a
//     streamed `onMiss` channel (per-completion), so warm-cache callers can
//     update state exactly once
//
// Per-URI errors are swallowed (onMiss is called with null) — one bad cover
// must not abort the batch. The session is always closed before returning,
// even if the source throws synchronously.
export async function fetchAlbumArtBatch(
  opts: FetchAlbumArtBatchOptions,
): Promise<FetchAlbumArtBatchResult> {
  const { dir, openSession, onMiss } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? 4);

  // Dedup while preserving first-seen order. Callers don't always dedup and
  // the album list can have multiple entries pointing at the same sampleUri
  // if the user has duplicate albums.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const uri of opts.uris) {
    if (!seen.has(uri)) {
      seen.add(uri);
      unique.push(uri);
    }
  }

  // First pass: collect cache hits into a single map. We honour the explicit
  // `dir` here (rather than using the global lookupCachedArt which resolves
  // dir from the environment) so tests can use a tmpdir.
  const cached = new Map<string, string>();
  const misses: string[] = [];
  for (const uri of unique) {
    const mem = memoryCache.get(uri);
    if (mem) {
      cached.set(uri, mem);
      continue;
    }
    const onDisk = findCachedArt(dir, uri);
    if (onDisk) {
      memoryCache.set(uri, onDisk);
      cached.set(uri, onDisk);
      continue;
    }
    misses.push(uri);
  }
  if (misses.length === 0) return { cached };

  // Only now do we pay the connect cost — and only once.
  const session = await openSession();
  try {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const i = next++;
        if (i >= misses.length) return;
        const uri = misses[i]!;
        let path: string | null = null;
        try {
          path = await fetchAlbumArt(session.source, uri, dir);
        } catch {
          path = null;
        }
        onMiss(uri, path);
      }
    };
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, misses.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
  } finally {
    try {
      await session.close();
    } catch {
      /* ignore */
    }
  }
  return { cached };
}

// Production wrapper: same shape but with the real MPD client. The caller
// supplies uris and an onMiss handler; cached hits come back grouped on the
// resolved value.
export async function fetchAlbumArtBatchViaMpc(
  uris: string[],
  onMiss: (uri: string, path: string | null) => void,
  concurrency = 4,
): Promise<FetchAlbumArtBatchResult> {
  const dir = cacheDir(process.env);
  return fetchAlbumArtBatch({
    uris,
    dir,
    concurrency,
    onMiss,
    openSession: async () => {
      // withClient owns the lifecycle internally, so we adapt it to the
      // ArtSession shape by exposing close() as a Promise that resolves when
      // withClient's callback returns. We use a deferred to keep the
      // connection alive until fetchAlbumArtBatch is done.
      let resolveDone!: () => void;
      const done = new Promise<void>((res) => {
        resolveDone = res;
      });
      let resolveSource!: (s: ArtSession) => void;
      let rejectSource!: (e: unknown) => void;
      const sourceReady = new Promise<ArtSession>((res, rej) => {
        resolveSource = res;
        rejectSource = rej;
      });
      // Kick off withClient but do not await it here; let it run for the
      // session's lifetime. We resolve sourceReady once we have the mpc,
      // and close() resolves `done` so withClient can disconnect.
      void withClient(async (mpc) => {
        const source = makeMpcSource(mpc);
        resolveSource({
          source,
          close: async () => {
            resolveDone();
          },
        });
        await done;
      }).catch((e) => {
        rejectSource(e);
      });
      return sourceReady;
    },
  });
}

// Default timeout for stream art fetches. Streams either return embedded
// art quickly (FLAC w/ cover) or never; 2s is plenty for the happy path
// and short enough that a wedged stream can't freeze the UI.
export const STREAM_ART_TIMEOUT_MS = 2000;

// Try to fetch embedded art for a webradio stream URI.
//
// Differences from fetchAlbumArt:
//   * Only calls getPicture (readpicture) — getAlbumArt (`albumart`
//     command) is local-file-only in MPD and errors for http:// URIs.
//   * Caps the underlying call with a timeout. MPD's `readpicture` against
//     a stream URI may have to wait for the decoder to surface a picture;
//     a hard cap keeps the UI responsive on slow/non-providing stations.
//   * Remembers negative results in a process-local set so we don't keep
//     hammering MPD on every refresh for a station with no embedded art.
//
// Returns a path on success, null on miss / timeout / error. Disk-cache
// hits short-circuit before any MPD round-trip.
export async function fetchStreamArt(
  source: ArtSource,
  uri: string,
  dir: string,
  timeoutMs: number = STREAM_ART_TIMEOUT_MS,
): Promise<string | null> {
  const cached = memoryCache.get(uri);
  if (cached) return cached;

  // Only an embedded slot counts as a cache hit here: this is the embedded
  // fetcher, and its result is labeled 'embedded' by the caller. A favicon/
  // webradiodb slot must NOT short-circuit (and must never be returned as if
  // it were embedded) — those sources are resolved separately in the UI.
  // findStreamArt returns the embedded slot iff one exists (it's highest
  // priority), so this is "embedded already cached?".
  const onDiskHit = findStreamArt(dir, uri);
  if (onDiskHit && onDiskHit.source === 'embedded') {
    memoryCache.set(uri, onDiskHit.path);
    return onDiskHit.path;
  }

  if (streamArtNegativeCache.has(uri)) return null;

  let picture: { binary: ArrayBuffer; type: string } | undefined;
  try {
    picture = await withTimeout(source.getPicture(uri), timeoutMs);
  } catch {
    // Both MPD errors ("no such song" for unknown URIs) and our own
    // TimeoutError end up here. Either way: no art this round. We swallow
    // silently because errors are routine for streams without embedded
    // pictures and would otherwise spam the console on every refresh.
    picture = undefined;
  }

  if (!picture) {
    streamArtNegativeCache.add(uri);
    return null;
  }

  try {
    mkdirSync(dir, { recursive: true });
    const path = streamArtCachePath(dir, uri, 'embedded', picture.type);
    writeFileSync(path, Buffer.from(picture.binary));
    memoryCache.set(uri, path);
    return path;
  } catch {
    return null;
  }
}

// Production wrapper for the embedded stream-art fetcher (readpicture) using a
// real MPD connection. Only a cached EMBEDDED slot (or the memory cache) counts
// as a warm-cache hit and skips the MPD connection; favicon/webradiodb slots
// are resolved in the UI layer, not here. A stream lacking embedded art will
// attempt readpicture once, then the negative cache short-circuits.
export async function fetchStreamArtViaMpc(
  uri: string,
  timeoutMs: number = STREAM_ART_TIMEOUT_MS,
): Promise<string | null> {
  // Fast path: memory cache, then the embedded disk slot only. Either skips the
  // MPD connection entirely, so a warm-cache (embedded) stream row costs zero
  // MPD calls.
  const mem = memoryCache.get(uri);
  if (mem) return mem;
  const dir = cacheDir(process.env);
  const onDisk = findStreamArt(dir, uri);
  if (onDisk && onDisk.source === 'embedded') {
    memoryCache.set(uri, onDisk.path);
    return onDisk.path;
  }
  if (streamArtNegativeCache.has(uri)) return null;
  return withClient<string | null>(async (mpc: MPC) => {
    return fetchStreamArt(makeMpcSource(mpc), uri, dir, timeoutMs);
  });
}
