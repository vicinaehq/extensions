import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStreamUri, streamHost } from './uri.js';

test('isStreamUri detects http(s)', () => {
  assert.equal(isStreamUri('http://example.com/stream'), true);
  assert.equal(isStreamUri('https://example.com/stream'), true);
  assert.equal(isStreamUri('HTTP://example.com/stream'), true);
});

test('isStreamUri detects other remote schemes', () => {
  assert.equal(isStreamUri('mms://example.com/live'), true);
  assert.equal(isStreamUri('rtmp://example.com/live'), true);
  assert.equal(isStreamUri('rtsp://example.com/live'), true);
});

test('isStreamUri rejects file:// and bare paths', () => {
  assert.equal(isStreamUri('file:///home/user/song.mp3'), false);
  assert.equal(isStreamUri('FILE:///home/user/song.mp3'), false);
  assert.equal(isStreamUri('Music/Artist/song.mp3'), false);
  assert.equal(isStreamUri('song.mp3'), false);
  assert.equal(isStreamUri(''), false);
});

test('isStreamUri rejects malformed scheme-like strings', () => {
  // No "://" — not a URI, just a colon in a filename.
  assert.equal(isStreamUri('weird:file.mp3'), false);
  // Scheme must start with a letter.
  assert.equal(isStreamUri('1http://example.com'), false);
});

test('streamHost extracts host for valid URLs', () => {
  assert.equal(streamHost('http://example.com/stream'), 'example.com');
  assert.equal(streamHost('https://radio.example.com:8000/live'), 'radio.example.com:8000');
});

test('streamHost returns empty string for non-URLs', () => {
  assert.equal(streamHost('not a url'), '');
  assert.equal(streamHost(''), '');
});
