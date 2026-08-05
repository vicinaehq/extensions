import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBufferedRecordSetter } from './buffered-setter.js';

test('flushes after the configured interval', async () => {
  const calls: Record<string, string>[] = [];
  const setter = createBufferedRecordSetter<string>(
    (updater) => {
      // Simulate React's functional setState by passing in the prior state.
      const prev = calls.length === 0 ? {} : calls[calls.length - 1]!;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      calls.push(next);
    },
    { intervalMs: 20 },
  );
  setter.push('a', '/cache/a.jpg');
  setter.push('b', '/cache/b.jpg');
  // Before the interval fires no setState should have happened yet.
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls.length, 0);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { a: '/cache/a.jpg', b: '/cache/b.jpg' });
  setter.flush();
});

test('flush() drains pending entries immediately', () => {
  const calls: Record<string, string>[] = [];
  const setter = createBufferedRecordSetter<string>(
    (updater) => {
      const prev = calls.length === 0 ? {} : calls[calls.length - 1]!;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      calls.push(next);
    },
    { intervalMs: 1000 },
  );
  setter.push('x', '/a');
  setter.push('y', '/b');
  setter.flush();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { x: '/a', y: '/b' });
});

test('flush() with no pending entries is a no-op', () => {
  const calls: Record<string, string>[] = [];
  const setter = createBufferedRecordSetter<string>((updater) => {
    const prev = calls.length === 0 ? {} : calls[calls.length - 1]!;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    calls.push(next);
  });
  setter.flush();
  setter.flush();
  assert.equal(calls.length, 0);
});

test('coalesces many pushes into a single setState per interval', async () => {
  const calls: Record<string, string>[] = [];
  const setter = createBufferedRecordSetter<string>(
    (updater) => {
      const prev = calls.length === 0 ? {} : calls[calls.length - 1]!;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      calls.push(next);
    },
    { intervalMs: 20 },
  );
  for (let i = 0; i < 50; i++) {
    setter.push(`uri-${i}`, `/cache/${i}.jpg`);
  }
  await new Promise((r) => setTimeout(r, 30));
  // 50 pushes -> ONE setState call.
  assert.equal(calls.length, 1);
  assert.equal(Object.keys(calls[0]!).length, 50);
});

test('null values are dropped', async () => {
  const calls: Record<string, string>[] = [];
  const setter = createBufferedRecordSetter<string>(
    (updater) => {
      const prev = calls.length === 0 ? {} : calls[calls.length - 1]!;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      calls.push(next);
    },
    { intervalMs: 10 },
  );
  setter.push('a', '/a.jpg');
  setter.push('b', null);
  setter.push('c', '/c.jpg');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls[0], { a: '/a.jpg', c: '/c.jpg' });
});

test('dispose() cancels any pending flush', async () => {
  const calls: Record<string, string>[] = [];
  const setter = createBufferedRecordSetter<string>(
    (updater) => {
      const prev = calls.length === 0 ? {} : calls[calls.length - 1]!;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      calls.push(next);
    },
    { intervalMs: 20 },
  );
  setter.push('a', '/a.jpg');
  setter.dispose();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls.length, 0);
});
