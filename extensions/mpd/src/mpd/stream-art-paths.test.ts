import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  streamArtCachePath,
  findStreamArt,
  STREAM_ART_SOURCES,
} from './stream-art-paths.js';

const h = (u: string) => createHash('sha1').update(u).digest('hex');

test('STREAM_ART_SOURCES is ordered highest-priority first', () => {
  assert.deepEqual([...STREAM_ART_SOURCES], ['embedded', 'webradiodb', 'favicon']);
});

test('streamArtCachePath namespaces by source and maps mime to ext', () => {
  assert.ok(
    streamArtCachePath('/c', 'http://s/x', 'webradiodb', 'image/webp')
      .endsWith(`${h('http://s/x')}.webradiodb.webp`),
  );
  assert.ok(
    streamArtCachePath('/c', 'http://s/x', 'favicon', 'image/png')
      .endsWith(`${h('http://s/x')}.favicon.png`),
  );
  assert.ok(
    streamArtCachePath('/c', 'http://s/x', 'embedded', undefined)
      .endsWith(`${h('http://s/x')}.embedded.jpg`),
  );
});

test('findStreamArt returns null when the dir does not exist', () => {
  assert.equal(findStreamArt('/no/such/dir', 'http://s/x'), null);
});

test('findStreamArt returns null when no slot exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sap-'));
  assert.equal(findStreamArt(dir, 'http://s/x'), null);
});

test('findStreamArt prefers the highest-priority source present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sap-'));
  mkdirSync(dir, { recursive: true });
  const uri = 'http://s/x';
  writeFileSync(join(dir, `${h(uri)}.favicon.png`), Buffer.alloc(120));
  writeFileSync(join(dir, `${h(uri)}.embedded.jpg`), Buffer.alloc(120));
  const got = findStreamArt(dir, uri);
  assert.ok(got);
  assert.equal(got!.source, 'embedded');
  assert.ok(got!.path.endsWith(`${h(uri)}.embedded.jpg`));
});

test('findStreamArt falls through to a lower-priority source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sap-'));
  mkdirSync(dir, { recursive: true });
  const uri = 'http://s/y';
  writeFileSync(join(dir, `${h(uri)}.favicon.png`), Buffer.alloc(120));
  const got = findStreamArt(dir, uri);
  assert.equal(got!.source, 'favicon');
});
