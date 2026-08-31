import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitTokens,
  mapSearchSong,
  mapSearchResults,
  type RawSearchSong,
} from './songs.js';

test('splitTokens: empty / whitespace produces no tokens', () => {
  assert.deepEqual(splitTokens(''), []);
  assert.deepEqual(splitTokens('   '), []);
  assert.deepEqual(splitTokens('\t\n'), []);
});

test('splitTokens: single token, lowercased', () => {
  assert.deepEqual(splitTokens('Hello'), ['hello']);
  assert.deepEqual(splitTokens('  HELLO '), ['hello']);
});

test('splitTokens: multiple tokens, collapses runs of whitespace', () => {
  assert.deepEqual(splitTokens('pale  slow   1994'), ['pale', 'slow', '1994']);
});

test('mapSearchSong: skips rows without path', () => {
  assert.equal(mapSearchSong({ title: 'x' } as RawSearchSong), undefined);
  assert.equal(mapSearchSong({ path: '' } as RawSearchSong), undefined);
});

test('mapSearchSong: maps full row, prefers albumArtist over artist', () => {
  const out = mapSearchSong({
    path: 'p/1.mp3',
    title: 'Track',
    artist: 'TrackArtist',
    albumArtist: 'TheBand',
    album: 'TheAlbum',
    date: '1994-05-10',
    duration: 252,
  });
  assert.deepEqual(out, {
    file: 'p/1.mp3',
    title: 'Track',
    artist: 'TheBand',
    album: 'TheAlbum',
    year: '1994',
    duration: 252,
  });
});

test('mapSearchSong: falls back to artist when albumArtist absent', () => {
  const out = mapSearchSong({
    path: 'p/2.mp3',
    title: 'T',
    artist: 'A',
  });
  assert.equal(out!.artist, 'A');
});

test('mapSearchSong: leaves artist/album undefined when missing or empty', () => {
  const out = mapSearchSong({ path: 'p.mp3', artist: '', album: '' });
  assert.equal(out!.artist, undefined);
  assert.equal(out!.album, undefined);
});

test('mapSearchSong: year extraction handles various date forms', () => {
  assert.equal(mapSearchSong({ path: 'a', date: '1994' })!.year, '1994');
  assert.equal(mapSearchSong({ path: 'a', date: '1994-05-10' })!.year, '1994');
  assert.equal(mapSearchSong({ path: 'a', date: '' })!.year, undefined);
  assert.equal(mapSearchSong({ path: 'a', date: '???' })!.year, undefined);
  assert.equal(mapSearchSong({ path: 'a' })!.year, undefined);
});

test('mapSearchSong: defaults duration to 0 when missing', () => {
  assert.equal(mapSearchSong({ path: 'a' })!.duration, 0);
});

test('mapSearchResults: drops invalid rows, preserves order', () => {
  const raws: RawSearchSong[] = [
    { path: 'a.mp3', title: 'A' },
    { title: 'no-path' } as RawSearchSong,
    { path: 'b.mp3', title: 'B' },
    { path: '' } as RawSearchSong,
    { path: 'c.mp3', title: 'C' },
  ];
  const out = mapSearchResults(raws);
  assert.deepEqual(
    out.map((s) => s.file),
    ['a.mp3', 'b.mp3', 'c.mp3'],
  );
});
