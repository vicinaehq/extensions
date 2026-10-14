import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeFilterValue,
  listAlbumsFast,
  enrichAlbumsWithRecency,
  type AlbumQueryClient,
  type SongLike,
} from './albums.js';

test('escapeFilterValue passes plain strings through', () => {
  assert.equal(escapeFilterValue('Pale Saints'), 'Pale Saints');
  assert.equal(escapeFilterValue(''), '');
});

test('escapeFilterValue escapes double quotes', () => {
  assert.equal(escapeFilterValue('Hello "World"'), 'Hello \\"World\\"');
});

test('escapeFilterValue doubles backslashes', () => {
  assert.equal(escapeFilterValue('back\\slash'), 'back\\\\slash');
});

test('escapeFilterValue handles backslashes before quotes correctly', () => {
  // Input: Foo "Bar\Baz"
  // Doubling backslashes first: Foo "Bar\\Baz"
  // Then escaping quotes:       Foo \"Bar\\Baz\"
  assert.equal(escapeFilterValue('Foo "Bar\\Baz"'), 'Foo \\"Bar\\\\Baz\\"');
});

// ---- listAlbumsFast ----

function makeListClient(grouped: { group: string[]; tags: string[] }[]): AlbumQueryClient {
  return {
    listAlbumsGrouped: async () => grouped,
    findSongs: async () => {
      throw new Error('findSongs not stubbed');
    },
  };
}

test('listAlbumsFast flattens grouped (Album, AlbumArtist, Date) tuples', async () => {
  const client = makeListClient([
    { group: ['Pale Saints', '1994'], tags: ['Slow Buildings', 'In Ribbons'] },
    { group: ['Cocteau Twins', '1990'], tags: ['Heaven or Las Vegas'] },
  ]);
  const albums = await listAlbumsFast(client);
  assert.equal(albums.length, 3);
  const slow = albums.find((a) => a.name === 'Slow Buildings')!;
  assert.equal(slow.artist, 'Pale Saints');
  assert.equal(slow.year, '1994');
  // Fast-path albums have placeholder/empty enrichment fields.
  assert.equal(slow.totalDuration, 0);
  assert.equal(slow.songCount, 0);
  assert.equal(slow.sampleUri, '');
  assert.equal(slow.lastModified.getTime(), 0);
  const heaven = albums.find((a) => a.name === 'Heaven or Las Vegas')!;
  assert.equal(heaven.artist, 'Cocteau Twins');
  assert.equal(heaven.year, '1990');
});

test('listAlbumsFast skips empty album names', async () => {
  const client = makeListClient([
    { group: ['X', '2001'], tags: ['', 'Real Album', ''] },
  ]);
  const albums = await listAlbumsFast(client);
  assert.equal(albums.length, 1);
  assert.equal(albums[0]!.name, 'Real Album');
});

test('listAlbumsFast falls back to Unknown Artist when AlbumArtist is blank', async () => {
  const client = makeListClient([
    { group: ['', ''], tags: ['Untitled'] },
  ]);
  const albums = await listAlbumsFast(client);
  assert.equal(albums[0]!.artist, 'Unknown Artist');
  assert.equal(albums[0]!.year, undefined);
});

test('listAlbumsFast tolerates Date being garbage', async () => {
  const client = makeListClient([
    { group: ['Artist', 'unknown'], tags: ['A'] },
    { group: ['Artist', ''], tags: ['B'] },
  ]);
  const albums = await listAlbumsFast(client);
  assert.equal(albums.find((a) => a.name === 'A')!.year, undefined);
  assert.equal(albums.find((a) => a.name === 'B')!.year, undefined);
});

// ---- enrichAlbumsWithRecency ----

const D = (s: string) => new Date(s);

test('enrichAlbumsWithRecency fills in lastModified, totalDuration, songCount, sampleUri', async () => {
  const base = [
    {
      name: 'A',
      artist: 'X',
      year: undefined,
      totalDuration: 0,
      songCount: 0,
      sampleUri: '',
      lastModified: new Date(0),
    },
    {
      name: 'B',
      artist: 'Y',
      year: undefined,
      totalDuration: 0,
      songCount: 0,
      sampleUri: '',
      lastModified: new Date(0),
    },
  ];
  const songs: SongLike[] = [
    { path: 'a/1.mp3', album: 'A', duration: 100, lastModified: D('2024-01-01') },
    { path: 'a/2.mp3', album: 'A', duration: 200, lastModified: D('2024-03-01') },
    { path: 'b/1.mp3', album: 'B', duration: 50, lastModified: D('2024-02-01') },
  ];
  const client: AlbumQueryClient = {
    listAlbumsGrouped: async () => [],
    findSongs: async () => songs,
  };
  const enriched = await enrichAlbumsWithRecency(client, base);
  const a = enriched.find((x) => x.name === 'A')!;
  assert.equal(a.totalDuration, 300);
  assert.equal(a.songCount, 2);
  assert.equal(a.sampleUri, 'a/1.mp3');
  assert.equal(a.lastModified.toISOString(), D('2024-03-01').toISOString());
  const b = enriched.find((x) => x.name === 'B')!;
  assert.equal(b.totalDuration, 50);
  assert.equal(b.songCount, 1);
  assert.equal(b.sampleUri, 'b/1.mp3');
});

test('enrichAlbumsWithRecency sorts albums by lastModified desc (newest first)', async () => {
  const base = [
    { name: 'Old', artist: 'X', year: undefined, totalDuration: 0, songCount: 0, sampleUri: '', lastModified: new Date(0) },
    { name: 'New', artist: 'X', year: undefined, totalDuration: 0, songCount: 0, sampleUri: '', lastModified: new Date(0) },
    { name: 'Mid', artist: 'X', year: undefined, totalDuration: 0, songCount: 0, sampleUri: '', lastModified: new Date(0) },
  ];
  const songs: SongLike[] = [
    { path: 'o.mp3', album: 'Old', duration: 1, lastModified: D('2020-01-01') },
    { path: 'n.mp3', album: 'New', duration: 1, lastModified: D('2025-01-01') },
    { path: 'm.mp3', album: 'Mid', duration: 1, lastModified: D('2023-06-01') },
  ];
  const client: AlbumQueryClient = {
    listAlbumsGrouped: async () => [],
    findSongs: async () => songs,
  };
  const enriched = await enrichAlbumsWithRecency(client, base);
  assert.deepEqual(enriched.map((a) => a.name), ['New', 'Mid', 'Old']);
});

test('enrichAlbumsWithRecency leaves albums with no matching songs at the bottom (zero mtime)', async () => {
  const base = [
    { name: 'Has', artist: 'X', year: undefined, totalDuration: 0, songCount: 0, sampleUri: '', lastModified: new Date(0) },
    { name: 'Orphan', artist: 'X', year: undefined, totalDuration: 0, songCount: 0, sampleUri: '', lastModified: new Date(0) },
  ];
  const songs: SongLike[] = [
    { path: 'h.mp3', album: 'Has', duration: 1, lastModified: D('2024-01-01') },
  ];
  const client: AlbumQueryClient = {
    listAlbumsGrouped: async () => [],
    findSongs: async () => songs,
  };
  const enriched = await enrichAlbumsWithRecency(client, base);
  assert.deepEqual(enriched.map((a) => a.name), ['Has', 'Orphan']);
  assert.equal(enriched.find((a) => a.name === 'Orphan')!.sampleUri, '');
});
