import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Album } from '../util/albums.js';
import {
  readAlbumsCache,
  writeAlbumsCache,
  albumsCachePath,
} from './albums-cache.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'mpd-albums-cache-'));
}

function album(name: string, lm: string): Album {
  return {
    name,
    artist: 'X',
    year: '2020',
    totalDuration: 100,
    songCount: 1,
    sampleUri: `${name}.mp3`,
    lastModified: new Date(lm),
  };
}

test('albumsCachePath lives alongside the art cache dir', () => {
  // The cache directory comes from cacheDir(env) and resolves to <root>/art —
  // the albums snapshot lives in the parent dir so removing the art cache
  // doesn't blow away the album list and vice versa.
  const env = { HOME: '/home/u' };
  assert.equal(albumsCachePath(env), '/home/u/.cache/vicinae-mpd/albums.json');
});

test('readAlbumsCache returns null when file is missing', () => {
  const dir = tmp();
  assert.equal(readAlbumsCache(join(dir, 'nope.json')), null);
  rmSync(dir, { recursive: true, force: true });
});

test('readAlbumsCache returns null for malformed JSON', () => {
  const dir = tmp();
  const p = join(dir, 'albums.json');
  writeFileSync(p, 'not json{');
  assert.equal(readAlbumsCache(p), null);
  rmSync(dir, { recursive: true, force: true });
});

test('readAlbumsCache returns null when shape is wrong', () => {
  const dir = tmp();
  const p = join(dir, 'albums.json');
  writeFileSync(p, JSON.stringify({ dbUpdate: 1, notAlbums: [] }));
  assert.equal(readAlbumsCache(p), null);
  rmSync(dir, { recursive: true, force: true });
});

test('writeAlbumsCache + readAlbumsCache round-trip preserves albums and dbUpdate', () => {
  const dir = tmp();
  const p = join(dir, 'albums.json');
  const albums: Album[] = [
    album('Slow Buildings', '2024-01-15T00:00:00.000Z'),
    album('Heaven or Las Vegas', '1990-09-17T00:00:00.000Z'),
  ];
  writeAlbumsCache(p, { dbUpdate: 1700000000, albums });
  const got = readAlbumsCache(p);
  assert.ok(got);
  assert.equal(got!.dbUpdate, 1700000000);
  assert.equal(got!.albums.length, 2);
  assert.equal(got!.albums[0]!.name, 'Slow Buildings');
  // Dates round-trip as Date objects, not strings.
  assert.ok(got!.albums[0]!.lastModified instanceof Date);
  assert.equal(
    got!.albums[0]!.lastModified.toISOString(),
    '2024-01-15T00:00:00.000Z',
  );
  rmSync(dir, { recursive: true, force: true });
});

test('writeAlbumsCache creates parent directories as needed', () => {
  const dir = tmp();
  const nested = join(dir, 'a', 'b', 'c', 'albums.json');
  writeAlbumsCache(nested, { dbUpdate: 1, albums: [album('A', '2024-01-01')] });
  assert.ok(existsSync(nested));
  const got = readAlbumsCache(nested);
  assert.ok(got);
  assert.equal(got!.albums[0]!.name, 'A');
  rmSync(dir, { recursive: true, force: true });
});

test('writeAlbumsCache is atomic (no partial file on read during write)', () => {
  // We can't easily simulate a crash mid-write in a unit test, but we can
  // assert that the written file parses cleanly back. The implementation is
  // expected to write+rename to ensure readers never see a truncated file.
  const dir = tmp();
  const p = join(dir, 'albums.json');
  writeAlbumsCache(p, {
    dbUpdate: 42,
    albums: Array.from({ length: 200 }, (_, i) => album(`A${i}`, '2024-01-01')),
  });
  const raw = readFileSync(p, 'utf8');
  // JSON.parse must not throw on the on-disk bytes at any point.
  const parsed = JSON.parse(raw);
  assert.equal(parsed.albums.length, 200);
  rmSync(dir, { recursive: true, force: true });
});

test('readAlbumsCache handles missing dbUpdate as undefined', () => {
  const dir = tmp();
  const p = join(dir, 'albums.json');
  writeFileSync(
    p,
    JSON.stringify({ dbUpdate: null, albums: [{ ...album('A', '2024-01-01'), lastModified: '2024-01-01T00:00:00.000Z' }] }),
  );
  const got = readAlbumsCache(p);
  assert.ok(got);
  assert.equal(got!.dbUpdate, undefined);
  rmSync(dir, { recursive: true, force: true });
});
