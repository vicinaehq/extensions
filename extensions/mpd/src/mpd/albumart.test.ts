import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  fetchAlbumArt,
  fetchAlbumArtBatch,
  findCachedArt,
  fetchStreamArt,
  fetchStreamArtViaMpc,
  STREAM_ART_TIMEOUT_MS,
  _resetMemoryCacheForTests,
  type ArtSource,
} from './albumart.js';
import { isTimeoutError } from '../util/timeout.js';

function hashOf(uri: string): string {
  return createHash('sha1').update(uri).digest('hex');
}

function makePicture(bytes: number[], type = 'image/jpeg') {
  return { binary: new Uint8Array(bytes).buffer, type };
}

test('fetches via getPicture, writes to disk, and returns path', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  let pictureCalls = 0;
  let albumCalls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      pictureCalls++;
      return makePicture([1, 2, 3, 4], 'image/png');
    },
    getAlbumArt: async () => {
      albumCalls++;
      return undefined;
    },
  };
  const path = await fetchAlbumArt(stub, 'song.mp3', dir);
  assert.ok(path);
  assert.ok(path!.endsWith('.png'));
  assert.deepEqual(Array.from(readFileSync(path!)), [1, 2, 3, 4]);
  assert.equal(pictureCalls, 1);
  assert.equal(albumCalls, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('falls back to getAlbumArt when getPicture returns undefined', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  const stub: ArtSource = {
    getPicture: async () => undefined,
    getAlbumArt: async () => makePicture([9, 9, 9], 'image/jpeg'),
  };
  const path = await fetchAlbumArt(stub, 'song.mp3', dir);
  assert.ok(path);
  assert.ok(path!.endsWith('.jpg'));
  assert.deepEqual(Array.from(readFileSync(path!)), [9, 9, 9]);
  rmSync(dir, { recursive: true, force: true });
});

test('returns null when no art is available from either command', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  const stub: ArtSource = {
    getPicture: async () => undefined,
    getAlbumArt: async () => undefined,
  };
  const path = await fetchAlbumArt(stub, 'song.mp3', dir);
  assert.equal(path, null);
  rmSync(dir, { recursive: true, force: true });
});

test('hits memory cache on the second call', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  let calls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      calls++;
      return makePicture([42], 'image/jpeg');
    },
    getAlbumArt: async () => undefined,
  };
  const p1 = await fetchAlbumArt(stub, 'song.mp3', dir);
  const p2 = await fetchAlbumArt(stub, 'song.mp3', dir);
  assert.equal(p1, p2);
  assert.equal(calls, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('hits disk cache when memory cache is cold but file exists', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  let calls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      calls++;
      return makePicture([7, 7], 'image/jpeg');
    },
    getAlbumArt: async () => undefined,
  };
  const p1 = await fetchAlbumArt(stub, 'song.mp3', dir);
  _resetMemoryCacheForTests();
  const p2 = await fetchAlbumArt(stub, 'song.mp3', dir);
  assert.equal(p1, p2);
  assert.equal(calls, 1);
  assert.ok(existsSync(p2!));
  rmSync(dir, { recursive: true, force: true });
});

test('findCachedArt returns null when directory does not exist', () => {
  const path = findCachedArt('/nonexistent/dir/xyz', 'song.mp3');
  assert.equal(path, null);
});

test('findCachedArt returns null when no file matches the hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  // Put some unrelated files in the cache dir.
  writeFileSync(join(dir, 'deadbeef.jpg'), Buffer.from([1]));
  writeFileSync(join(dir, 'cafef00d.png'), Buffer.from([1]));
  const path = findCachedArt(dir, 'song.mp3');
  assert.equal(path, null);
  rmSync(dir, { recursive: true, force: true });
});

test('findCachedArt finds a .jpg cache file by hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  const expected = join(dir, `${hashOf('song.mp3')}.jpg`);
  writeFileSync(expected, Buffer.from([1, 2, 3]));
  assert.equal(findCachedArt(dir, 'song.mp3'), expected);
  rmSync(dir, { recursive: true, force: true });
});

test('findCachedArt finds .png, .webp, .gif by hash', () => {
  for (const ext of ['png', 'webp', 'gif']) {
    const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
    const expected = join(dir, `${hashOf('s.mp3')}.${ext}`);
    writeFileSync(expected, Buffer.from([1]));
    assert.equal(findCachedArt(dir, 's.mp3'), expected);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findCachedArt does not scan unrelated files in a large cache', () => {
  // Regression: prior implementation used readdirSync which scaled with the
  // total number of cache entries. With the extension-probe implementation
  // a directory full of unrelated entries must not affect lookup correctness.
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  for (let i = 0; i < 50; i++) {
    writeFileSync(join(dir, `${'a'.repeat(40 - String(i).length) + i}.jpg`), Buffer.from([1]));
  }
  const target = join(dir, `${hashOf('target.mp3')}.png`);
  writeFileSync(target, Buffer.from([9]));
  assert.equal(findCachedArt(dir, 'target.mp3'), target);
  // Also confirm that a non-existent uri returns null even with many entries.
  assert.equal(findCachedArt(dir, 'missing.mp3'), null);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchAlbumArt does not call source when disk cache hits (no MPD round-trip)', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  // Pre-seed the on-disk cache as if a previous run had written it.
  mkdirSync(dir, { recursive: true });
  const seeded = join(dir, `${hashOf('song.mp3')}.jpg`);
  writeFileSync(seeded, Buffer.from([1, 2, 3]));
  let pictureCalls = 0;
  let albumCalls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      pictureCalls++;
      return undefined;
    },
    getAlbumArt: async () => {
      albumCalls++;
      return undefined;
    },
  };
  const path = await fetchAlbumArt(stub, 'song.mp3', dir);
  assert.equal(path, seeded);
  assert.equal(pictureCalls, 0);
  assert.equal(albumCalls, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('swallows fetch errors and returns null', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  const stub: ArtSource = {
    getPicture: async () => {
      throw new Error('mpd boom');
    },
    getAlbumArt: async () => {
      throw new Error('mpd boom');
    },
  };
  const path = await fetchAlbumArt(stub, 'song.mp3', dir);
  assert.equal(path, null);
  rmSync(dir, { recursive: true, force: true });
});

// ---- fetchAlbumArtBatch: shared-connection art loader ----
//
// The batch loader owns the connection lifecycle and is the single entry point
// the UI uses to fetch art for a whole album list. Tests use an injectable
// "session factory" — the production code wires it to withClient(MPD), tests
// wire it to an in-memory stub that records open/close to verify we only open
// one connection per call.
//
// API contract: cached hits are returned synchronously as one grouped `cached`
// map on the returned promise. ONLY cache-miss results stream through onMiss.
// This lets the UI collapse a thousand cache hits into a single setState call
// while still rendering each MPD fetch as it lands.

test('fetchAlbumArtBatch returns all cache hits as a grouped map and never calls onMiss', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  for (const uri of ['a.mp3', 'b.mp3', 'c.mp3']) {
    writeFileSync(join(dir, `${hashOf(uri)}.jpg`), Buffer.from([1]));
  }
  let opens = 0;
  let missCalls = 0;
  const result = await fetchAlbumArtBatch({
    uris: ['a.mp3', 'b.mp3', 'c.mp3'],
    dir,
    openSession: async () => {
      opens++;
      return {
        source: {
          getPicture: async () => undefined,
          getAlbumArt: async () => undefined,
        },
        close: async () => {},
      };
    },
    onMiss: () => {
      missCalls++;
    },
  });
  assert.equal(opens, 0);
  assert.equal(missCalls, 0);
  assert.equal(result.cached.size, 3);
  for (const uri of ['a.mp3', 'b.mp3', 'c.mp3']) {
    const path = result.cached.get(uri);
    assert.ok(path);
    assert.ok(path.endsWith('.jpg'));
  }
  rmSync(dir, { recursive: true, force: true });
});

test('fetchAlbumArtBatch opens exactly one session for many cache-miss uris and streams them via onMiss', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  const uris = Array.from({ length: 25 }, (_, i) => `track-${i}.mp3`);
  let opens = 0;
  let closes = 0;
  const seen: string[] = [];
  const missed = new Map<string, string | null>();
  const result = await fetchAlbumArtBatch({
    uris,
    dir,
    openSession: async () => {
      opens++;
      return {
        source: {
          getPicture: async (u) => {
            seen.push(u);
            return { binary: new Uint8Array([1, 2, 3]).buffer, type: 'image/jpeg' };
          },
          getAlbumArt: async () => undefined,
        },
        close: async () => {
          closes++;
        },
      };
    },
    onMiss: (uri, path) => {
      missed.set(uri, path);
    },
    concurrency: 4,
  });
  assert.equal(opens, 1);
  assert.equal(closes, 1);
  assert.equal(seen.length, 25);
  assert.equal(missed.size, 25);
  assert.equal(result.cached.size, 0);
  for (const uri of uris) {
    const path = missed.get(uri);
    assert.ok(path);
    assert.ok(path!.endsWith('.jpg'));
  }
  rmSync(dir, { recursive: true, force: true });
});

test('fetchAlbumArtBatch deduplicates input uris', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  let getCalls = 0;
  await fetchAlbumArtBatch({
    uris: ['x.mp3', 'x.mp3', 'x.mp3'],
    dir,
    openSession: async () => ({
      source: {
        getPicture: async () => {
          getCalls++;
          return { binary: new Uint8Array([1]).buffer, type: 'image/png' };
        },
        getAlbumArt: async () => undefined,
      },
      close: async () => {},
    }),
    onMiss: () => {},
  });
  assert.equal(getCalls, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchAlbumArtBatch respects concurrency limit', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  let inFlight = 0;
  let maxInFlight = 0;
  const uris = Array.from({ length: 12 }, (_, i) => `u${i}.mp3`);
  await fetchAlbumArtBatch({
    uris,
    dir,
    concurrency: 3,
    openSession: async () => ({
      source: {
        getPicture: async () => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight--;
          return { binary: new Uint8Array([1]).buffer, type: 'image/jpeg' };
        },
        getAlbumArt: async () => undefined,
      },
      close: async () => {},
    }),
    onMiss: () => {},
  });
  assert.ok(maxInFlight <= 3, `maxInFlight=${maxInFlight} exceeded concurrency=3`);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchAlbumArtBatch streams miss results as they complete', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  const completed: string[] = [];
  await fetchAlbumArtBatch({
    uris: ['a.mp3', 'b.mp3'],
    dir,
    openSession: async () => ({
      source: {
        getPicture: async (u) => {
          // Make b.mp3 resolve first by sleeping longer for a.mp3.
          if (u === 'a.mp3') await new Promise((r) => setTimeout(r, 20));
          return { binary: new Uint8Array([1]).buffer, type: 'image/jpeg' };
        },
        getAlbumArt: async () => undefined,
      },
      close: async () => {},
    }),
    onMiss: (uri) => {
      completed.push(uri);
    },
  });
  assert.deepEqual(completed, ['b.mp3', 'a.mp3']);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchAlbumArtBatch closes the session even on per-uri errors', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  let closes = 0;
  const missed = new Map<string, string | null>();
  await fetchAlbumArtBatch({
    uris: ['boom.mp3', 'ok.mp3'],
    dir,
    openSession: async () => ({
      source: {
        getPicture: async (u) => {
          if (u === 'boom.mp3') throw new Error('mpd boom');
          return { binary: new Uint8Array([1]).buffer, type: 'image/jpeg' };
        },
        getAlbumArt: async () => undefined,
      },
      close: async () => {
        closes++;
      },
    }),
    onMiss: (uri, path) => {
      missed.set(uri, path);
    },
  });
  assert.equal(closes, 1);
  assert.equal(missed.get('boom.mp3'), null);
  assert.ok(missed.get('ok.mp3'));
  rmSync(dir, { recursive: true, force: true });
});

test('fetchAlbumArtBatch separates cached hits from streamed misses in a mixed batch', async () => {
  // Mixed scenario: 2 cached, 3 misses. Cached come back in `cached`, misses
  // stream via onMiss, and the session opens exactly once for the misses.
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  for (const uri of ['cached1.mp3', 'cached2.mp3']) {
    writeFileSync(join(dir, `${hashOf(uri)}.jpg`), Buffer.from([1]));
  }
  let opens = 0;
  const missed = new Map<string, string | null>();
  const result = await fetchAlbumArtBatch({
    uris: ['cached1.mp3', 'miss1.mp3', 'cached2.mp3', 'miss2.mp3', 'miss3.mp3'],
    dir,
    openSession: async () => {
      opens++;
      return {
        source: {
          getPicture: async () => ({
            binary: new Uint8Array([1]).buffer,
            type: 'image/jpeg',
          }),
          getAlbumArt: async () => undefined,
        },
        close: async () => {},
      };
    },
    onMiss: (uri, path) => {
      missed.set(uri, path);
    },
  });
  assert.equal(opens, 1);
  assert.equal(result.cached.size, 2);
  assert.ok(result.cached.has('cached1.mp3'));
  assert.ok(result.cached.has('cached2.mp3'));
  assert.equal(missed.size, 3);
  for (const m of ['miss1.mp3', 'miss2.mp3', 'miss3.mp3']) {
    assert.ok(missed.has(m));
  }
});

test('fetchAlbumArtBatch does not call onMiss when uri list is empty', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-art-'));
  let opens = 0;
  let missCalls = 0;
  const result = await fetchAlbumArtBatch({
    uris: [],
    dir,
    openSession: async () => {
      opens++;
      return {
        source: {
          getPicture: async () => undefined,
          getAlbumArt: async () => undefined,
        },
        close: async () => {},
      };
    },
    onMiss: () => {
      missCalls++;
    },
  });
  assert.equal(opens, 0);
  assert.equal(missCalls, 0);
  assert.equal(result.cached.size, 0);
  rmSync(dir, { recursive: true, force: true });
});

// ---- fetchStreamArt: dedicated path for webradio URIs ----

test('fetchStreamArt writes returned picture to cache and returns its path', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-stream-art-'));
  let pictureCalls = 0;
  let albumCalls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      pictureCalls++;
      return makePicture([7, 7, 7], 'image/png');
    },
    getAlbumArt: async () => {
      // Must NOT be called for streams — `albumart` is local-file-only.
      albumCalls++;
      return undefined;
    },
  };
  const uri = 'http://radio.example.com/live';
  const path = await fetchStreamArt(stub, uri, dir);
  assert.ok(path);
  assert.equal(path, join(dir, `${hashOf(uri)}.embedded.png`));
  assert.deepEqual(Array.from(readFileSync(path!)), [7, 7, 7]);
  assert.equal(pictureCalls, 1);
  assert.equal(albumCalls, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchStreamArt does not call source when embedded-slot disk cache hits', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-stream-art-'));
  // Pre-seed the embedded-slot cache as if a previous run had written it.
  mkdirSync(dir, { recursive: true });
  const uri = 'http://radio.example.com/seeded';
  const seeded = join(dir, `${hashOf(uri)}.embedded.jpg`);
  writeFileSync(seeded, Buffer.from([5, 6, 7]));
  let pictureCalls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      pictureCalls++;
      return undefined;
    },
    getAlbumArt: async () => undefined,
  };
  const path = await fetchStreamArt(stub, uri, dir);
  assert.equal(path, seeded);
  assert.equal(pictureCalls, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchStreamArt ignores a non-embedded slot and fetches embedded art', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-stream-art-'));
  mkdirSync(dir, { recursive: true });
  const uri = 'http://stream.example/live';
  // Seed ONLY a favicon slot — it must NOT short-circuit the embedded fetcher.
  writeFileSync(join(dir, `${hashOf(uri)}.favicon.png`), Buffer.alloc(120));
  let pictureCalls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      pictureCalls++;
      return makePicture([0x89, 0x50, 0x4e, 0x47], 'image/png');
    },
    getAlbumArt: async () => undefined,
  };
  const path = await fetchStreamArt(stub, uri, dir);
  // Must have fetched (not short-circuited on the favicon) and written the
  // embedded slot — never returned the favicon path.
  assert.equal(pictureCalls, 1);
  assert.equal(path, join(dir, `${hashOf(uri)}.embedded.png`));
  rmSync(dir, { recursive: true, force: true });
});

test('fetchStreamArt returns null and remembers negative result so second call skips MPD', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-stream-art-'));
  let calls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      calls++;
      return undefined;
    },
    getAlbumArt: async () => undefined,
  };
  const a = await fetchStreamArt(stub, 'http://radio.example.com/live', dir);
  const b = await fetchStreamArt(stub, 'http://radio.example.com/live', dir);
  assert.equal(a, null);
  assert.equal(b, null);
  // Second call MUST be served from the negative cache.
  assert.equal(calls, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchStreamArt returns null when getPicture exceeds the timeout', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-stream-art-'));
  const slow: ArtSource = {
    getPicture: () =>
      new Promise((resolve) =>
        setTimeout(() => resolve(makePicture([1])), 200),
      ),
    getAlbumArt: async () => undefined,
  };
  const path = await fetchStreamArt(slow, 'http://slow.example.com/live', dir, 20);
  assert.equal(path, null);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchStreamArt swallows errors and returns null (network/MPD error)', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-stream-art-'));
  const broken: ArtSource = {
    getPicture: async () => {
      throw new Error('mpd error');
    },
    getAlbumArt: async () => undefined,
  };
  const path = await fetchStreamArt(broken, 'http://broken.example.com/live', dir);
  assert.equal(path, null);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchStreamArt returns the cached path on subsequent calls without hitting the source', async () => {
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'mpd-stream-art-'));
  let calls = 0;
  const stub: ArtSource = {
    getPicture: async () => {
      calls++;
      return makePicture([4, 2], 'image/jpeg');
    },
    getAlbumArt: async () => undefined,
  };
  const uri = 'http://radio.example.com/cached';
  const a = await fetchStreamArt(stub, uri, dir);
  const b = await fetchStreamArt(stub, uri, dir);
  assert.equal(a, b);
  assert.ok(a);
  assert.equal(calls, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('fetchStreamArtViaMpc returns the embedded-slot path from disk without opening MPD', async () => {
  // Point MPD at an unreachable target so reaching withClient() would reject.
  // The disk fast path must return the seeded embedded slot BEFORE withClient
  // is touched, proving "warm cache = zero MPD calls".
  _resetMemoryCacheForTests();
  const dir = mkdtempSync(join(tmpdir(), 'sa-'));
  const origCache = process.env.XDG_CACHE_HOME;
  const origHost = process.env.MPD_HOST;
  const origPort = process.env.MPD_PORT;
  process.env.XDG_CACHE_HOME = dir;
  // 127.0.0.1:1 — no MPD listens here; any connect attempt fails fast.
  process.env.MPD_HOST = '127.0.0.1';
  process.env.MPD_PORT = '1';
  try {
    const uri = 'http://stream.example/live';
    const artDir = join(dir, 'vicinae-mpd', 'art');
    mkdirSync(artDir, { recursive: true });
    const seeded = join(artDir, `${hashOf(uri)}.embedded.png`);
    writeFileSync(seeded, Buffer.alloc(120));
    const path = await fetchStreamArtViaMpc(uri);
    assert.equal(path, seeded);
  } finally {
    if (origCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = origCache;
    if (origHost === undefined) delete process.env.MPD_HOST;
    else process.env.MPD_HOST = origHost;
    if (origPort === undefined) delete process.env.MPD_PORT;
    else process.env.MPD_PORT = origPort;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('STREAM_ART_TIMEOUT_MS is exported and reasonable', () => {
  assert.ok(STREAM_ART_TIMEOUT_MS >= 500 && STREAM_ART_TIMEOUT_MS <= 10_000);
});

test('isTimeoutError is exported and callable from albumart consumers', () => {
  assert.equal(typeof isTimeoutError, 'function');
});

