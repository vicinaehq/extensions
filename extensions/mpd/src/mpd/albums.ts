import type { MPC } from 'mpc-js';
import { aggregateAlbums, type Album, type SongLike } from '../util/albums.js';

// Re-export so callers (and tests) have a single import surface for album types.
export type { Album, SongLike };

export function escapeFilterValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Minimal interface the album queries need from the MPD client. Allows the
// pure logic in listAlbumsFast / enrichAlbumsWithRecency to be unit-tested
// without a live MPD connection.
export interface AlbumQueryClient {
  // `list Album group AlbumArtist group Date`
  listAlbumsGrouped(): Promise<{ group: string[]; tags: string[] }[]>;
  // `find (album != "") sort -Last-Modified`
  findSongs(): Promise<SongLike[]>;
}

function mpcAdapter(mpc: MPC): AlbumQueryClient {
  return {
    listAlbumsGrouped: async () => {
      const result = await mpc.database.listGrouped('Album', [
        'AlbumArtist',
        'Date',
      ]);
      return result.map((g) => ({ group: g.group, tags: g.tags }));
    },
    findSongs: async () => {
      return (await mpc.database.find(
        '(album != "")',
        undefined,
        undefined,
        '-Last-Modified',
      )) as unknown as SongLike[];
    },
  };
}

function yearFromDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const first4 = raw.slice(0, 4);
  return /^\d{4}$/.test(first4) ? first4 : undefined;
}

// Fast path: use MPD's `list` command which returns distinct album names plus
// grouping tags. This is ~9x faster and ~70x smaller on the wire than the
// per-song `find` we previously used, because it returns only album-level
// rows (~thousands) instead of every song (~tens of thousands).
//
// The trade-off: this call does NOT give us per-album lastModified, total
// duration, song count, or a sample URI for cover-art lookups. Those are
// filled in lazily by enrichAlbumsWithRecency() so the UI can render the list
// almost immediately and let the heavier query complete in the background.
export async function listAlbumsFast(
  client: AlbumQueryClient,
): Promise<Album[]> {
  const grouped = await client.listAlbumsGrouped();
  const albums: Album[] = [];
  for (const g of grouped) {
    const artistRaw = g.group[0] ?? '';
    const dateRaw = g.group[1] ?? '';
    const artist = artistRaw && artistRaw.length > 0 ? artistRaw : 'Unknown Artist';
    const year = yearFromDate(dateRaw);
    for (const name of g.tags) {
      if (!name) continue;
      albums.push({
        name,
        artist,
        year,
        totalDuration: 0,
        songCount: 0,
        sampleUri: '',
        lastModified: new Date(0),
      });
    }
  }
  return albums;
}

// Enrich an album list with the data we don't get from `list`: lastModified,
// totalDuration, songCount, sampleUri. Runs the heavier `find` query and
// merges song-level data back onto the existing album entries (matched by
// album name — same key the previous aggregator used).
//
// After merging, albums are re-sorted by lastModified descending so the UI's
// final order matches the historical "sorted by last added" behaviour. Albums
// with no matching songs (e.g. the MPD db changed between the two queries)
// keep their zero-epoch lastModified and sink to the bottom.
export async function enrichAlbumsWithRecency(
  client: AlbumQueryClient,
  albums: Album[],
): Promise<Album[]> {
  const songs = await client.findSongs();
  // Index by album name. Multiple albums with the same name (across artists)
  // will share enrichment — same limitation as the legacy aggregateAlbums.
  const byName = new Map<string, Album>();
  for (const a of albums) {
    if (!byName.has(a.name)) byName.set(a.name, { ...a });
  }
  for (const s of songs) {
    if (!s.album || !s.path) continue;
    const a = byName.get(s.album);
    if (!a) continue;
    const dur = typeof s.duration === 'number' ? s.duration : 0;
    a.totalDuration += dur;
    a.songCount += 1;
    if (!a.sampleUri) a.sampleUri = s.path;
    const lm = s.lastModified ?? new Date(0);
    if (lm.getTime() > a.lastModified.getTime()) {
      a.lastModified = lm;
    }
  }
  const out = Array.from(byName.values());
  out.sort((x, y) => y.lastModified.getTime() - x.lastModified.getTime());
  return out;
}

// Convenience: do both steps over a real MPC. Returns enriched, sorted albums.
// Kept for callers that just want the fully-loaded result in one call (and so
// the test suite's existing `getAlbums` reference keeps working).
export async function getAlbums(mpc: MPC): Promise<Album[]> {
  // Backward-compatible path used by the tests / utilities. The UI uses the
  // two-step fast/enrich pattern directly for better perceived latency.
  const client = mpcAdapter(mpc);
  const songs = await client.findSongs();
  return aggregateAlbums(songs);
}

// Two-step fast loader: invokes `onFast` as soon as the cheap `list` query
// returns, then runs the heavier `find`-based enrichment on the same MPD
// connection and resolves with the final, sort-correct album list.
//
// The callback-shape (rather than returning a promise of a promise) lets the
// caller wrap the whole thing in a single withClient() — the connection
// stays open across both queries instead of being torn down between them.
export async function loadAlbumsTwoStep(
  mpc: MPC,
  onFast: (fast: Album[]) => void,
): Promise<Album[]> {
  const client = mpcAdapter(mpc);
  const fast = await listAlbumsFast(client);
  onFast(fast);
  return enrichAlbumsWithRecency(client, fast);
}

// MPD's `dbUpdate` timestamp from `stats` — the moment the music database
// was last updated. Used by the persisted album-list cache to detect when
// a stored snapshot is still authoritative.
export async function getDbUpdate(mpc: MPC): Promise<number | undefined> {
  const stats = await mpc.status.statistics();
  return stats.dbUpdate ? stats.dbUpdate.getTime() : undefined;
}

// Build an MPD command_list_ok_begin/end batch by hand and send it as one
// sendCommand call. This makes clear+findadd+play atomic from MPD's perspective
// (no transient empty-queue window seen by other clients).
async function sendCommandList(mpc: MPC, commands: string[]): Promise<void> {
  const batch = ['command_list_ok_begin', ...commands, 'command_list_end'].join(
    '\n',
  );
  await mpc.sendCommand(batch);
}

export async function playAlbum(mpc: MPC, albumName: string): Promise<void> {
  const escaped = escapeFilterValue(albumName);
  await sendCommandList(mpc, [
    'clear',
    `findadd "(Album == \\"${escaped}\\")" sort Track`,
    'play',
  ]);
}

export async function addAlbumToQueue(
  mpc: MPC,
  albumName: string,
): Promise<void> {
  // findAdd lives on the database commands namespace, not currentPlaylist.
  // The tuple-filter form lets mpc-js handle quote-escaping for us.
  await mpc.database.findAdd(
    [['Album', albumName]],
    undefined,
    undefined,
    'Track',
  );
}
