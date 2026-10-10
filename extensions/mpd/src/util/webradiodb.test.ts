import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  sanitizeStreamUri,
  webradioDbPicUrl,
  downloadWebradioDbPicture,
  WEBRADIODB_BASE,
  WEBRADIODB_TIMEOUT_MS,
  _setFetchForTests,
  _resetForTests,
} from './webradiodb.js';

const h = (u: string) => createHash('sha1').update(u).digest('hex');

function webpResponse(): Response {
  const bytes = [
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, ...new Array(120).fill(0),
  ];
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'image/webp' },
  });
}

test('sanitizeStreamUri matches the webradiodb convention', () => {
  assert.equal(
    sanitizeStreamUri('http://hd.lagrosseradio.info/lagrosseradio-reggae-192.mp3'),
    'http___hd_lagrosseradio_info_lagrosseradio-reggae-192_mp3',
  );
});

test('webradioDbPicUrl builds the pics path', () => {
  const url = webradioDbPicUrl('http://s/x');
  assert.ok(url.startsWith(WEBRADIODB_BASE));
  assert.ok(url.endsWith('/db/pics/http___s_x.webp'));
});

test('downloadWebradioDbPicture writes a validated webp to the webradiodb slot', async () => {
  _resetForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'wdb-'));
  const orig = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(async () => webpResponse());
    const uri = 'http://stream.example/abc';
    const path = await downloadWebradioDbPicture(uri);
    assert.ok(path);
    const expected = join(artDir, 'vicinae-mpd', 'art', `${h(uri)}.webradiodb.webp`);
    assert.equal(path, expected);
    assert.ok(existsSync(expected));
    assert.deepEqual(Array.from(readFileSync(path!)), [
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, ...new Array(120).fill(0),
    ]);
  } finally {
    if (orig === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = orig;
  }
});

test('downloadWebradioDbPicture returns null on 404', async () => {
  _resetForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'wdb-'));
  const orig = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(async () => new Response('nope', { status: 404 }));
    assert.equal(await downloadWebradioDbPicture('http://s/x'), null);
  } finally {
    if (orig === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = orig;
  }
});

test('downloadWebradioDbPicture returns null when body is not an image', async () => {
  _resetForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'wdb-'));
  const orig = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(async () =>
      new Response('<!DOCTYPE html><html>404</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    assert.equal(await downloadWebradioDbPicture('http://s/x'), null);
  } finally {
    if (orig === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = orig;
  }
});

test('downloadWebradioDbPicture swallows network errors', async () => {
  _resetForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'wdb-'));
  const orig = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(async () => {
      throw new TypeError('network');
    });
    assert.equal(await downloadWebradioDbPicture('http://s/x'), null);
  } finally {
    if (orig === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = orig;
  }
});

test('downloadWebradioDbPicture returns null when the request aborts (timeout wiring)', async () => {
  _resetForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'wdb-'));
  const orig = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal }).signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }
          // never resolves otherwise
        }),
    );
    const start = Date.now();
    const path = await downloadWebradioDbPicture('http://s/x');
    const elapsed = Date.now() - start;
    assert.equal(path, null);
    assert.ok(
      elapsed >= WEBRADIODB_TIMEOUT_MS - 50,
      `elapsed=${elapsed}ms (expected >= ${WEBRADIODB_TIMEOUT_MS - 50})`,
    );
  } finally {
    if (orig === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = orig;
  }
});
