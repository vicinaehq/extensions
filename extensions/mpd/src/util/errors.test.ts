import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage } from './errors.js';

test('errorMessage: Error instance returns .message', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
});

test('errorMessage: mpc-js MPDError shape with code returns formatted MPD message', () => {
  assert.equal(
    errorMessage({ errorCode: 2, errorMessage: 'incomplete expression' }),
    'MPD [2]: incomplete expression',
  );
});

test('errorMessage: MPDError-shaped without code returns the raw message', () => {
  assert.equal(
    errorMessage({ errorMessage: 'unknown command "search"' }),
    'unknown command "search"',
  );
});

test('errorMessage: string thrown returns the string', () => {
  assert.equal(errorMessage('plain string error'), 'plain string error');
});

test('errorMessage: unknown object never returns [object Object]', () => {
  assert.equal(errorMessage({ totally: 'unrelated' }), 'Unknown error');
});

test('errorMessage: null / undefined are stringified safely', () => {
  assert.equal(errorMessage(null), 'null');
  assert.equal(errorMessage(undefined), 'undefined');
});

test('errorMessage: object with empty errorMessage falls through to safe stringify', () => {
  assert.equal(errorMessage({ errorMessage: '', errorCode: 7 }), 'Unknown error');
});
