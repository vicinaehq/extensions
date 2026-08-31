import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from './client.js';

test('defaults to localhost:6600 when env vars unset', () => {
  const c = resolveConfig({});
  assert.deepEqual(c, { kind: 'tcp', host: 'localhost', port: 6600 });
});

test('reads MPD_HOST and MPD_PORT', () => {
  const c = resolveConfig({ MPD_HOST: 'mpd.local', MPD_PORT: '6601' });
  assert.deepEqual(c, { kind: 'tcp', host: 'mpd.local', port: 6601 });
});

test('absolute path in MPD_HOST is treated as a unix socket', () => {
  const c = resolveConfig({ MPD_HOST: '/run/user/1000/mpd/socket' });
  assert.deepEqual(c, { kind: 'unix', path: '/run/user/1000/mpd/socket' });
});

test('tilde-prefixed MPD_HOST is treated as a unix socket (raw, expansion deferred)', () => {
  const c = resolveConfig({ MPD_HOST: '~/mpd.sock' });
  assert.deepEqual(c, { kind: 'unix', path: '~/mpd.sock' });
});

test('invalid MPD_PORT falls back to 6600', () => {
  const c = resolveConfig({ MPD_HOST: 'x', MPD_PORT: 'not-a-number' });
  assert.deepEqual(c, { kind: 'tcp', host: 'x', port: 6600 });
});
