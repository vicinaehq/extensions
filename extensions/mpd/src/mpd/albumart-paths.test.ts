import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheDir, cachePathFor, mimeToExt } from './albumart-paths.js';

test('cacheDir prefers XDG_CACHE_HOME', () => {
  const dir = cacheDir({ XDG_CACHE_HOME: '/tmp/xdg', HOME: '/home/u' });
  assert.equal(dir, '/tmp/xdg/vicinae-mpd/art');
});

test('cacheDir falls back to HOME/.cache', () => {
  const dir = cacheDir({ HOME: '/home/u' });
  assert.equal(dir, '/home/u/.cache/vicinae-mpd/art');
});

test('cacheDir falls back to /tmp when HOME is missing', () => {
  const dir = cacheDir({});
  assert.equal(dir, '/tmp/vicinae-mpd/art');
});

test('mimeToExt maps known image types', () => {
  assert.equal(mimeToExt('image/jpeg'), 'jpg');
  assert.equal(mimeToExt('image/png'), 'png');
  assert.equal(mimeToExt('image/webp'), 'webp');
  assert.equal(mimeToExt('image/gif'), 'gif');
});

test('mimeToExt defaults unknown types to jpg', () => {
  assert.equal(mimeToExt(undefined), 'jpg');
  assert.equal(mimeToExt('application/octet-stream'), 'jpg');
});

test('cachePathFor produces deterministic sha1-based filenames', () => {
  const p1 = cachePathFor('/cache', 'foo/bar.mp3', 'image/jpeg');
  const p2 = cachePathFor('/cache', 'foo/bar.mp3', 'image/jpeg');
  assert.equal(p1, p2);
  assert.match(p1, /^\/cache\/[0-9a-f]{40}\.jpg$/);
});

test('cachePathFor distinguishes different uris', () => {
  const a = cachePathFor('/cache', 'a.mp3', 'image/jpeg');
  const b = cachePathFor('/cache', 'b.mp3', 'image/jpeg');
  assert.notEqual(a, b);
});
