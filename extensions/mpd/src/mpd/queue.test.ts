import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapQueueState, type RawPlaylistItem, type RawStatus } from './queue.js';

test('maps PlaylistItem[] and Status into QueueState', () => {
  const items: RawPlaylistItem[] = [
    { id: 10, position: 0, path: 'a.mp3', title: 'A', artist: 'X', album: 'Z', duration: 120, track: '1' },
    { id: 11, position: 1, path: 'b.mp3', title: 'B', artist: 'Y', album: 'Z', duration: 60, track: '2' },
  ];
  const status: RawStatus = { state: 'play', songId: 11 };
  const out = mapQueueState(items, status);
  assert.deepEqual(out, {
    items: [
      { id: 10, pos: 0, file: 'a.mp3', title: 'A', name: undefined, artist: 'X', album: 'Z', duration: 120, track: 1 },
      { id: 11, pos: 1, file: 'b.mp3', title: 'B', name: undefined, artist: 'Y', album: 'Z', duration: 60, track: 2 },
    ],
    currentSongId: 11,
    state: 'play',
    currentSong: null,
  });
});

test('uses null for currentSongId when songId is undefined', () => {
  const out = mapQueueState([], { state: 'stop' });
  assert.equal(out.currentSongId, null);
  assert.equal(out.state, 'stop');
  assert.deepEqual(out.items, []);
  assert.equal(out.currentSong, null);
});

test('overlays currentSong when MPD reports one with an id', () => {
  const items: RawPlaylistItem[] = [
    { id: 7, position: 0, path: 'http://radio.example.com/live' },
  ];
  const out = mapQueueState(
    items,
    { state: 'play', songId: 7 },
    { id: 7, title: 'Live Title', name: 'Live Station' },
  );
  assert.deepEqual(out.currentSong, {
    id: 7,
    title: 'Live Title',
    name: 'Live Station',
  });
});

test('currentSong is null when MPD returns an empty currentsong (stopped)', () => {
  const out = mapQueueState([], { state: 'stop' }, { /* no id */ });
  assert.equal(out.currentSong, null);
});

test('currentSong is null when no third argument is given (backwards compat)', () => {
  const out = mapQueueState([], { state: 'stop' });
  assert.equal(out.currentSong, null);
});

test('defaults duration to 0 and treats missing optional fields as undefined', () => {
  const items: RawPlaylistItem[] = [
    { id: 1, position: 0, path: 'untagged.mp3' },
  ];
  const out = mapQueueState(items, { state: 'pause', songId: 1 });
  assert.deepEqual(out.items[0], {
    id: 1,
    pos: 0,
    file: 'untagged.mp3',
    title: undefined,
    name: undefined,
    artist: undefined,
    album: undefined,
    duration: 0,
    track: undefined,
  });
  assert.equal(out.state, 'pause');
});

test('skips items with missing id (defensive)', () => {
  const items: RawPlaylistItem[] = [
    { id: undefined, position: 0, path: 'broken.mp3' },
    { id: 5, position: 1, path: 'ok.mp3' },
  ];
  const out = mapQueueState(items, { state: 'play', songId: 5 });
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0]!.id, 5);
});

test('parses track tag in common forms', () => {
  const items: RawPlaylistItem[] = [
    { id: 1, position: 0, path: '1.mp3', track: '3' },
    { id: 2, position: 1, path: '2.mp3', track: '03' },
    { id: 3, position: 2, path: '3.mp3', track: '3/11' },
    { id: 4, position: 3, path: '4.mp3', track: '12/12' },
  ];
  const out = mapQueueState(items, { state: 'stop' });
  assert.equal(out.items[0]!.track, 3);
  assert.equal(out.items[1]!.track, 3);
  assert.equal(out.items[2]!.track, 3);
  assert.equal(out.items[3]!.track, 12);
});

test('maps a webradio stream item: surfaces Name, allows http path, duration 0', () => {
  const items: RawPlaylistItem[] = [
    {
      id: 42,
      position: 0,
      path: 'http://radio.example.com/live',
      name: 'My Radio',
      title: 'Currently Playing Track',
      // No duration / no track / no album for streams.
    },
  ];
  const out = mapQueueState(items, { state: 'play', songId: 42 });
  assert.equal(out.items.length, 1);
  const item = out.items[0]!;
  assert.equal(item.id, 42);
  assert.equal(item.file, 'http://radio.example.com/live');
  assert.equal(item.name, 'My Radio');
  assert.equal(item.title, 'Currently Playing Track');
  assert.equal(item.duration, 0);
  assert.equal(item.track, undefined);
});

test('leaves track undefined when tag is missing or garbage', () => {
  const items: RawPlaylistItem[] = [
    { id: 1, position: 0, path: '1.mp3' },
    { id: 2, position: 1, path: '2.mp3', track: '' },
    { id: 3, position: 2, path: '3.mp3', track: '???' },
    { id: 4, position: 3, path: '4.mp3', track: '/11' },
  ];
  const out = mapQueueState(items, { state: 'stop' });
  assert.equal(out.items[0]!.track, undefined);
  assert.equal(out.items[1]!.track, undefined);
  assert.equal(out.items[2]!.track, undefined);
  assert.equal(out.items[3]!.track, undefined);
});
