import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, TimeoutError, isTimeoutError } from './timeout.js';

test('withTimeout resolves with the underlying value when it settles in time', async () => {
  const out = await withTimeout(Promise.resolve(42), 100);
  assert.equal(out, 42);
});

test('withTimeout rejects with TimeoutError when the operation is too slow', async () => {
  const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 200));
  await assert.rejects(withTimeout(slow, 20), (e) => {
    assert.ok(isTimeoutError(e), 'expected TimeoutError');
    assert.equal((e as TimeoutError).timeoutMs, 20);
    return true;
  });
});

test('withTimeout propagates underlying rejections (not as TimeoutError)', async () => {
  const boom = Promise.reject(new Error('downstream'));
  await assert.rejects(withTimeout(boom, 50), (e) => {
    assert.ok(e instanceof Error);
    assert.equal((e as Error).message, 'downstream');
    assert.ok(!isTimeoutError(e));
    return true;
  });
});

test('withTimeout does not leak timers when the inner promise resolves first', async () => {
  // A timer that never fires would keep the event loop alive. If the test
  // process exits cleanly, the timer was cleared. We assert by waiting past
  // the would-be deadline and observing no unhandled rejection.
  let unhandled: unknown = null;
  const onRejection = (e: unknown) => {
    unhandled = e;
  };
  process.once('unhandledRejection', onRejection);
  await withTimeout(Promise.resolve('ok'), 10);
  await new Promise((r) => setTimeout(r, 30));
  process.removeListener('unhandledRejection', onRejection);
  assert.equal(unhandled, null);
});

test('isTimeoutError narrows correctly', () => {
  assert.equal(isTimeoutError(new TimeoutError(1)), true);
  assert.equal(isTimeoutError(new Error('nope')), false);
  assert.equal(isTimeoutError('string'), false);
  assert.equal(isTimeoutError(null), false);
});
