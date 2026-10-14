import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateAlbums,
  matchesAlbumQuery,
  type SongLike,
} from './albums.js';

const D = (s: string) => new Date(s);

test('aggregates multiple songs of one album into one Album', () => {
  const songs: SongLike[] = [
    {
      path: 'a/1.mp3',
      album: 'Slow Buildings',
      albumArtist: 'Pale Saints',
      date: '1994-05-10',
      duration: 252,
      lastModified: D('2024-01-15'),
    },
    {
      path: 'a/2.mp3',
      album: 'Slow Buildings',
      albumArtist: 'Pale Saints',
      date: '1994-05-10',
      duration: 180,
      lastModified: D('2024-01-10'),
    },
  ];
  const out = aggregateAlbums(songs);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    name: 'Slow Buildings',
    artist: 'Pale Saints',
    year: '1994',
    totalDuration: 432,
    songCount: 2,
    sampleUri: 'a/1.mp3',
    lastModified: D('2024-01-15'),
  });
});

test('preserves input order across distinct albums', () => {
  const songs: SongLike[] = [
    {
      path: 'b/1.mp3',
      album: 'B',
      albumArtist: 'X',
      duration: 100,
      lastModified: D('2024-02-01'),
    },
    {
      path: 'a/1.mp3',
      album: 'A',
      albumArtist: 'Y',
      duration: 100,
      lastModified: D('2024-01-01'),
    },
  ];
  const out = aggregateAlbums(songs);
  assert.deepEqual(
    out.map((a) => a.name),
    ['B', 'A'],
  );
});

test('skips songs without album or path', () => {
  const songs: SongLike[] = [
    { path: '', album: 'A', duration: 1, lastModified: D('2024-01-01') },
    { path: 'x.mp3', album: '', duration: 1, lastModified: D('2024-01-01') },
    { path: 'y.mp3', album: 'A', duration: 1, lastModified: D('2024-01-01') },
  ];
  const out = aggregateAlbums(songs);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.name, 'A');
  assert.equal(out[0]!.songCount, 1);
});

test('falls back from albumArtist to artist, then to Unknown Artist', () => {
  const songs: SongLike[] = [
    {
      path: 'a.mp3',
      album: 'A',
      artist: 'OnlyArtist',
      duration: 1,
      lastModified: D('2024-01-01'),
    },
    { path: 'b.mp3', album: 'B', duration: 1, lastModified: D('2024-01-01') },
  ];
  const out = aggregateAlbums(songs);
  assert.equal(out[0]!.artist, 'OnlyArtist');
  assert.equal(out[1]!.artist, 'Unknown Artist');
});

test('year extraction handles ISO date, year only, empty, and garbage', () => {
  const songs: SongLike[] = [
    {
      path: '1.mp3',
      album: 'Year1',
      date: '1994',
      duration: 1,
      lastModified: D('2024-01-01'),
    },
    {
      path: '2.mp3',
      album: 'Year2',
      date: '1994-05-10',
      duration: 1,
      lastModified: D('2024-01-01'),
    },
    {
      path: '3.mp3',
      album: 'Year3',
      date: '',
      duration: 1,
      lastModified: D('2024-01-01'),
    },
    {
      path: '4.mp3',
      album: 'Year4',
      date: '???',
      duration: 1,
      lastModified: D('2024-01-01'),
    },
    {
      path: '5.mp3',
      album: 'Year5',
      duration: 1,
      lastModified: D('2024-01-01'),
    },
  ];
  const out = aggregateAlbums(songs);
  const byName = Object.fromEntries(out.map((a) => [a.name, a.year]));
  assert.equal(byName['Year1'], '1994');
  assert.equal(byName['Year2'], '1994');
  assert.equal(byName['Year3'], undefined);
  assert.equal(byName['Year4'], undefined);
  assert.equal(byName['Year5'], undefined);
});

test('lastModified is the max across the album songs regardless of input order', () => {
  const songs: SongLike[] = [
    { path: '1.mp3', album: 'A', duration: 1, lastModified: D('2024-01-01') },
    { path: '2.mp3', album: 'A', duration: 1, lastModified: D('2024-06-15') },
    { path: '3.mp3', album: 'A', duration: 1, lastModified: D('2024-03-01') },
  ];
  const out = aggregateAlbums(songs);
  assert.equal(
    out[0]!.lastModified.toISOString(),
    D('2024-06-15').toISOString(),
  );
});

test('defaults totalDuration to 0 when songs lack duration', () => {
  const songs: SongLike[] = [
    { path: '1.mp3', album: 'A', lastModified: D('2024-01-01') },
    { path: '2.mp3', album: 'A', lastModified: D('2024-01-01') },
  ];
  const out = aggregateAlbums(songs);
  assert.equal(out[0]!.totalDuration, 0);
  assert.equal(out[0]!.songCount, 2);
});

const sampleAlbum = {
  name: 'Slow Buildings',
  artist: 'Pale Saints',
  year: '1994',
  totalDuration: 432,
  songCount: 11,
  sampleUri: 'a/1.mp3',
  lastModified: D('2024-01-15'),
};

test('matchesAlbumQuery returns true for empty query', () => {
  assert.equal(matchesAlbumQuery(sampleAlbum, ''), true);
  assert.equal(matchesAlbumQuery(sampleAlbum, '   '), true);
});

test('matchesAlbumQuery matches a single substring token case-insensitively in title', () => {
  assert.equal(matchesAlbumQuery(sampleAlbum, 'BUILDINGS'), true);
  assert.equal(matchesAlbumQuery(sampleAlbum, 'slow'), true);
  assert.equal(matchesAlbumQuery(sampleAlbum, 'uildi'), true);
});

test('matchesAlbumQuery matches in artist field', () => {
  assert.equal(matchesAlbumQuery(sampleAlbum, 'pale'), true);
  assert.equal(matchesAlbumQuery(sampleAlbum, 'saints'), true);
});

test('matchesAlbumQuery matches in year field', () => {
  assert.equal(matchesAlbumQuery(sampleAlbum, '1994'), true);
  assert.equal(matchesAlbumQuery(sampleAlbum, '99'), true);
});

test('matchesAlbumQuery requires ALL tokens (token-AND) across fields', () => {
  // "pale" in artist, "slow" in title -> both present -> match
  assert.equal(matchesAlbumQuery(sampleAlbum, 'pale slow'), true);
  // "pale" in artist, "1994" in year -> both present -> match
  assert.equal(matchesAlbumQuery(sampleAlbum, 'pale 1994'), true);
  // "pale" matches, "nope" does not -> AND fails -> no match
  assert.equal(matchesAlbumQuery(sampleAlbum, 'pale nope'), false);
});

test('matchesAlbumQuery returns false when no token matches', () => {
  assert.equal(matchesAlbumQuery(sampleAlbum, 'xyz'), false);
});

test('matchesAlbumQuery handles album with no year', () => {
  const noYear = { ...sampleAlbum, year: undefined };
  assert.equal(matchesAlbumQuery(noYear, 'pale'), true);
  assert.equal(matchesAlbumQuery(noYear, '1994'), false);
});

test('matchesAlbumQuery collapses multiple spaces between tokens', () => {
  assert.equal(matchesAlbumQuery(sampleAlbum, 'pale    slow'), true);
});
