import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  basename,
  sectionTitle,
  formatTrackNumber,
} from './format.js';

test('formatDuration zero', () => {
  assert.equal(formatDuration(0), '0:00');
});
test('formatDuration < 1 minute', () => {
  assert.equal(formatDuration(7), '0:07');
});
test('formatDuration < 1 hour', () => {
  assert.equal(formatDuration(125), '2:05');
});
test('formatDuration >= 1 hour', () => {
  assert.equal(formatDuration(3661), '1:01:01');
});
test('formatDuration negative or NaN -> 0:00', () => {
  assert.equal(formatDuration(-3), '0:00');
  assert.equal(formatDuration(Number.NaN), '0:00');
});

test('basename strips directory components', () => {
  assert.equal(basename('foo/bar/baz.mp3'), 'baz.mp3');
  assert.equal(basename('only.mp3'), 'only.mp3');
  assert.equal(basename(''), '');
});

test('sectionTitle reflects state and count', () => {
  assert.equal(sectionTitle('play', 3), 'Playing \u2014 3 songs');
  assert.equal(sectionTitle('pause', 1), 'Paused \u2014 1 song');
  assert.equal(sectionTitle('stop', 0), 'Stopped \u2014 0 songs');
});

test('formatTrackNumber pads to at least 2 digits (1-based input)', () => {
  assert.equal(formatTrackNumber(1), '01');
  assert.equal(formatTrackNumber(9), '09');
  assert.equal(formatTrackNumber(10), '10');
  assert.equal(formatTrackNumber(99), '99');
});

test('formatTrackNumber lets numbers >= 100 grow naturally', () => {
  assert.equal(formatTrackNumber(100), '100');
  assert.equal(formatTrackNumber(999), '999');
});

test('formatTrackNumber returns "00" for invalid input', () => {
  assert.equal(formatTrackNumber(0), '00');
  assert.equal(formatTrackNumber(-1), '00');
  assert.equal(formatTrackNumber(Number.NaN), '00');
});
