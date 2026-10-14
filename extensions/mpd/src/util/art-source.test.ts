import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeArt, type ArtEntry } from './art-source.js';

test('mergeArt inserts a new entry', () => {
  const next = mergeArt({}, 'u', '/f.png', 'favicon');
  assert.deepEqual(next['u'], { path: '/f.png', source: 'favicon' });
});

test('webradiodb replaces favicon regardless of arrival order', () => {
  const a = mergeArt({}, 'u', '/f.png', 'favicon');
  const b = mergeArt(a, 'u', '/w.webp', 'webradiodb');
  assert.equal(b['u']!.source, 'webradiodb');
  assert.equal(b['u']!.path, '/w.webp');
});

test('favicon does NOT overwrite embedded (returns same ref)', () => {
  const a = mergeArt({}, 'u', '/e.jpg', 'embedded');
  const b = mergeArt(a, 'u', '/f.png', 'favicon');
  assert.equal(b, a);
});

test('embedded overwrites a previously-set favicon', () => {
  const a = mergeArt({}, 'u', '/f.png', 'favicon');
  const b = mergeArt(a, 'u', '/e.jpg', 'embedded');
  assert.equal(b['u']!.source, 'embedded');
});

test('identical re-set returns the same ref (no needless render)', () => {
  const a = mergeArt({}, 'u', '/w.webp', 'webradiodb');
  const b = mergeArt(a, 'u', '/w.webp', 'webradiodb');
  assert.equal(b, a);
});

test('equal priority with a different source/path replaces (last writer wins)', () => {
  const a = mergeArt({}, 'u', '/local.png', 'local');
  const b = mergeArt(a, 'u', '/embed.jpg', 'embedded'); // both priority 3
  assert.notEqual(b, a);
  assert.deepEqual(b['u'], { path: '/embed.jpg', source: 'embedded' });
});

test('does not mutate the previous record', () => {
  const prev: Record<string, ArtEntry> = {};
  mergeArt(prev, 'u', '/x.png', 'favicon');
  assert.deepEqual(prev, {});
});
