import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchSongs,
  addSongToQueue,
  SONG_SEARCH_LIMIT,
  PER_TAG_FETCH_LIMIT,
  SEARCH_TAGS,
  type SongQueryClient,
  type PlaybackClient,
} from './songs.js';
import type { RawSearchSong } from '../util/songs.js';

// --- searchSongs --------------------------------------------------------

function recordingClient(handler?: (tag: string, needle: string) => RawSearchSong[]) {
  const calls: Array<{ tag: string; needle: string; limit: number }> = [];
  const client: SongQueryClient = {
    searchTag: async (tag, needle, limit) => {
      calls.push({ tag, needle, limit });
      return handler ? handler(tag, needle) : [];
    },
  };
  return { client, calls };
}

test('searchSongs: empty / whitespace query returns empty result and makes no calls', async () => {
  const { client, calls } = recordingClient();
  const out = await searchSongs(client, '   ');
  assert.deepEqual(out, { songs: [], truncated: false });
  assert.equal(calls.length, 0);
});

test('searchSongs: single token fires one call per tag with the right limit', async () => {
  const { client, calls } = recordingClient();
  await searchSongs(client, 'beatles');
  assert.equal(calls.length, SEARCH_TAGS.length);
  assert.deepEqual(
    calls.map((c) => c.tag).sort(),
    [...SEARCH_TAGS].sort(),
  );
  assert.ok(calls.every((c) => c.needle === 'beatles'));
  assert.ok(calls.every((c) => c.limit === PER_TAG_FETCH_LIMIT));
});

test('searchSongs: passes the lowercased token (splitTokens lowercases)', async () => {
  const { client, calls } = recordingClient();
  await searchSongs(client, 'BEATLES');
  assert.ok(calls.every((c) => c.needle === 'beatles'));
});

test('searchSongs: multi-token fires SEARCH_TAGS calls per token', async () => {
  const { client, calls } = recordingClient();
  await searchSongs(client, 'pale slow');
  assert.equal(calls.length, SEARCH_TAGS.length * 2);
  const needles = new Set(calls.map((c) => c.needle));
  assert.deepEqual([...needles].sort(), ['pale', 'slow']);
});

test('searchSongs: unions per-tag results by path within a token (no duplicates)', async () => {
  const { client } = recordingClient((tag) => {
    if (tag === 'Title') return [{ path: 'a.mp3', title: 'A' }];
    if (tag === 'Artist') return [{ path: 'a.mp3', title: 'A' }, { path: 'b.mp3', title: 'B' }];
    return [{ path: 'b.mp3', title: 'B' }, { path: 'c.mp3', title: 'C' }];
  });
  const out = await searchSongs(client, 'q');
  assert.deepEqual(
    out.songs.map((s) => s.file),
    ['a.mp3', 'b.mp3', 'c.mp3'],
  );
});

test('searchSongs: intersects across tokens (token-AND semantics)', async () => {
  // Token "x" matches a.mp3 and b.mp3 (via Title). Token "y" matches b.mp3
  // and c.mp3 (via Album). Intersection should be just b.mp3.
  const { client } = recordingClient((tag, needle) => {
    if (needle === 'x' && tag === 'Title') return [{ path: 'a.mp3' }, { path: 'b.mp3' }];
    if (needle === 'y' && tag === 'Album') return [{ path: 'b.mp3' }, { path: 'c.mp3' }];
    return [];
  });
  const out = await searchSongs(client, 'x y');
  assert.deepEqual(out.songs.map((s) => s.file), ['b.mp3']);
});

test('searchSongs: no-intersection returns empty', async () => {
  const { client } = recordingClient((tag, needle) => {
    if (needle === 'x' && tag === 'Title') return [{ path: 'a.mp3' }];
    if (needle === 'y' && tag === 'Title') return [{ path: 'z.mp3' }];
    return [];
  });
  const out = await searchSongs(client, 'x y');
  assert.deepEqual(out.songs, []);
  assert.equal(out.truncated, false);
});

test('searchSongs: skips rows without path during union', async () => {
  const { client } = recordingClient((tag) =>
    tag === 'Title'
      ? ([
          { title: 'no-path' } as RawSearchSong,
          { path: 'real.mp3', title: 'Real' },
        ] as RawSearchSong[])
      : [],
  );
  const out = await searchSongs(client, 'q');
  assert.deepEqual(out.songs.map((s) => s.file), ['real.mp3']);
});

test('searchSongs: caps result count at SONG_SEARCH_LIMIT and reports truncated', async () => {
  // Make Title return SONG_SEARCH_LIMIT + 10 unique paths.
  const many: RawSearchSong[] = Array.from(
    { length: SONG_SEARCH_LIMIT + 10 },
    (_, i) => ({ path: `s${i}.mp3` }),
  );
  const { client } = recordingClient((tag) => (tag === 'Title' ? many : []));
  const out = await searchSongs(client, 'q');
  assert.equal(out.songs.length, SONG_SEARCH_LIMIT);
  assert.equal(out.truncated, true);
});

test('searchSongs: returns truncated=false when result count is below the cap', async () => {
  const { client } = recordingClient((tag) =>
    tag === 'Title' ? [{ path: 'a.mp3' }, { path: 'b.mp3' }] : [],
  );
  const out = await searchSongs(client, 'q');
  assert.equal(out.songs.length, 2);
  assert.equal(out.truncated, false);
});

test('searchSongs: maps raw rows to Song shape with metadata', async () => {
  const { client } = recordingClient((tag) =>
    tag === 'Title'
      ? [
          {
            path: 'a.mp3',
            title: 'TheTitle',
            albumArtist: 'TheArtist',
            album: 'TheAlbum',
            date: '1994',
            duration: 252,
          },
        ]
      : [],
  );
  const out = await searchSongs(client, 'q');
  assert.equal(out.songs.length, 1);
  assert.deepEqual(out.songs[0], {
    file: 'a.mp3',
    title: 'TheTitle',
    artist: 'TheArtist',
    album: 'TheAlbum',
    year: '1994',
    duration: 252,
  });
});

// --- addSongToQueue -----------------------------------------------------

test('addSongToQueue: auto-plays new song when MPD was stopped', async () => {
  const calls: string[] = [];
  const client: PlaybackClient = {
    status: async () => {
      calls.push('status');
      return { state: 'stop' };
    },
    addId: async (file) => {
      calls.push(`addId:${file}`);
      return 42;
    },
    play: async (id) => {
      calls.push(`play:${id}`);
    },
  };
  const out = await addSongToQueue(client, 'song.mp3');
  assert.deepEqual(out, { id: 42, started: true });
  assert.deepEqual(calls, ['status', 'addId:song.mp3', 'play:42']);
});

test('addSongToQueue: does not auto-play when MPD is already playing', async () => {
  const calls: string[] = [];
  const client: PlaybackClient = {
    status: async () => {
      calls.push('status');
      return { state: 'play' };
    },
    addId: async () => {
      calls.push('addId');
      return 7;
    },
    play: async () => {
      calls.push('play');
    },
  };
  const out = await addSongToQueue(client, 'x.mp3');
  assert.deepEqual(out, { id: 7, started: false });
  assert.deepEqual(calls, ['status', 'addId']);
});

test('addSongToQueue: does not auto-play when MPD is paused', async () => {
  const client: PlaybackClient = {
    status: async () => ({ state: 'pause' }),
    addId: async () => 9,
    play: async () => {
      throw new Error('should not be called');
    },
  };
  const out = await addSongToQueue(client, 'x.mp3');
  assert.equal(out.started, false);
});

test('addSongToQueue: treats missing state as not-stopped (no auto-play)', async () => {
  const client: PlaybackClient = {
    status: async () => ({}),
    addId: async () => 1,
    play: async () => {
      throw new Error('should not be called');
    },
  };
  const out = await addSongToQueue(client, 'x.mp3');
  assert.equal(out.started, false);
});
