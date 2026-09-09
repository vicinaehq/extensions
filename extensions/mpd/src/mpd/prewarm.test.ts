import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prewarmAlbumArt, _resetPrewarmStateForTests } from './prewarm.js';

test('prewarmAlbumArt resolves to a summary of cached/fetched/failed counts', async () => {
  _resetPrewarmStateForTests();
  // Provide an injected batch implementation so the test stays hermetic.
  // New shape: cache hits come back grouped in result.cached, misses stream
  // via onMiss.
  const summary = await prewarmAlbumArt(['a.mp3', 'b.mp3'], {
    batch: async (uris, onMiss) => {
      // Treat a.mp3 as a fetched miss, b.mp3 as a failed miss.
      onMiss(uris[0]!, '/cache/a.jpg');
      onMiss(uris[1]!, null);
      return { cached: new Map() };
    },
  });
  assert.deepEqual(summary, { resolved: 1, missing: 1 });
});

test('prewarmAlbumArt counts grouped cached hits toward resolved', async () => {
  _resetPrewarmStateForTests();
  const summary = await prewarmAlbumArt(['a.mp3', 'b.mp3', 'c.mp3'], {
    batch: async () => ({
      cached: new Map([
        ['a.mp3', '/cache/a.jpg'],
        ['b.mp3', '/cache/b.jpg'],
        ['c.mp3', '/cache/c.jpg'],
      ]),
    }),
  });
  assert.deepEqual(summary, { resolved: 3, missing: 0 });
});

test('prewarmAlbumArt swallows errors and reports zero on failure', async () => {
  _resetPrewarmStateForTests();
  const summary = await prewarmAlbumArt(['a.mp3'], {
    batch: async () => {
      throw new Error('mpd down');
    },
  });
  assert.deepEqual(summary, { resolved: 0, missing: 1 });
});

test('prewarmAlbumArt returns early on empty input without invoking the batch', async () => {
  _resetPrewarmStateForTests();
  let called = false;
  const summary = await prewarmAlbumArt([], {
    batch: async () => {
      called = true;
      return { cached: new Map() };
    },
  });
  assert.equal(called, false);
  assert.deepEqual(summary, { resolved: 0, missing: 0 });
});

test('prewarmAlbumArt coalesces concurrent calls for the same uri set', async () => {
  // While one prewarm is in flight, a second invocation with the same uris
  // should reuse the in-flight promise rather than opening another MPD
  // connection.
  _resetPrewarmStateForTests();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const opts = {
    batch: async (
      uris: string[],
      onMiss: (u: string, p: string | null) => void,
    ) => {
      calls++;
      await gate;
      for (const u of uris) onMiss(u, '/cache/x.jpg');
      return { cached: new Map<string, string>() };
    },
  };
  const p1 = prewarmAlbumArt(['a.mp3'], opts);
  const p2 = prewarmAlbumArt(['a.mp3'], opts);
  // Both should be in-flight against the same batch invocation.
  release();
  const [s1, s2] = await Promise.all([p1, p2]);
  assert.equal(calls, 1);
  assert.deepEqual(s1, { resolved: 1, missing: 0 });
  assert.deepEqual(s2, { resolved: 1, missing: 0 });
});
