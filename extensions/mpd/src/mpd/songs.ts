import type { MPC } from 'mpc-js';
import {
  mapSearchResults,
  splitTokens,
  type RawSearchSong,
  type Song,
} from '../util/songs.js';
import { escapeFilterValue } from './albums.js';

export type { Song };

// Hard cap on results we return to the UI. The list component shows a
// "first N" hint when this many rows come back. Picked to be generous enough
// for almost any single-word search yet small enough to keep responses well
// under a second on a large library.
export const SONG_SEARCH_LIMIT = 200;

// Per-tag-per-token MPD response cap. We over-fetch a bit on each individual
// search so the union and the intersection don't truncate at the source —
// the final SONG_SEARCH_LIMIT cap is applied client-side after merging.
//
// Why over-fetch: if you search `pale slow`, each per-tag query for `pale`
// might return 400 rows, the per-tag query for `slow` 300 rows, and the
// intersection of those might be just 12 — capping each per-tag query at
// 200 would risk dropping the very rows that intersect. 1000 is enough for
// practical libraries while staying cheap on the wire.
export const PER_TAG_FETCH_LIMIT = 1000;

// Tags we OR across for each token. Order is the order the underlying MPD
// queries fire; results from earlier tags appear first in the per-token
// union (we de-dup by `path`).
export const SEARCH_TAGS: readonly string[] = ['Title', 'Artist', 'Album'];

// Minimal interface mpd/songs needs from the MPD client. Lets the pure
// query-building + result-mapping be unit-tested with a stub.
//
// Note: we use the tuple-form `[[tag, needle]]` filter exclusively. This is
// the same form `database.findAdd` is called with in mpd/albums.ts (which
// works in production). It sidesteps the hand-built filter-expression
// grammar entirely, so we don't depend on MPD's parenthesised expression
// parser nor on getting mpc-js's outer-quote escaping right.
export interface SongQueryClient {
  searchTag(tag: string, needle: string, limit: number): Promise<RawSearchSong[]>;
}

export type SearchResult = {
  songs: Song[];
  // True iff after merging we still had at least SONG_SEARCH_LIMIT rows —
  // meaning we capped the list and there might be more matches we didn't
  // return to the UI.
  truncated: boolean;
};

// Union of multiple raw-result arrays, de-duplicated by `path`. First
// occurrence wins so we preserve the row that has the richest metadata when
// MPD returns slightly different copies from different per-tag queries
// (rare, but documented to happen on some MPD versions).
function unionByPath(groups: RawSearchSong[][]): RawSearchSong[] {
  const seen = new Set<string>();
  const out: RawSearchSong[] = [];
  for (const group of groups) {
    for (const r of group) {
      if (!r.path) continue;
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      out.push(r);
    }
  }
  return out;
}

// Intersection of multiple already-unioned arrays, keyed by `path`. Returns
// rows in the order of the first input (so the user sees stable ordering).
function intersectByPath(unions: RawSearchSong[][]): RawSearchSong[] {
  if (unions.length === 0) return [];
  if (unions.length === 1) return unions[0]!;
  const sets = unions.slice(1).map((u) => {
    const s = new Set<string>();
    for (const r of u) if (r.path) s.add(r.path);
    return s;
  });
  return unions[0]!.filter((r) => {
    if (!r.path) return false;
    return sets.every((s) => s.has(r.path!));
  });
}

// Search for songs matching every token (AND across tokens), where each token
// matches if it appears as a case-insensitive substring of Title, Artist, or
// Album (OR across tags).
//
// Implementation: one MPD `search` query per (tag, token) pair, parallelised
// across tags within a token, then sequenced across tokens (we only need the
// next token's queries if the first token actually returned something — but
// for simplicity we fire them all). Per-token results are unioned across
// tags; then we intersect across tokens.
export async function searchSongs(
  client: SongQueryClient,
  query: string,
): Promise<SearchResult> {
  const tokens = splitTokens(query);
  if (tokens.length === 0) return { songs: [], truncated: false };

  // For each token, fire one search per tag in parallel, then union.
  const perTokenUnions = await Promise.all(
    tokens.map(async (token) => {
      const perTag = await Promise.all(
        SEARCH_TAGS.map((tag) =>
          client.searchTag(tag, token, PER_TAG_FETCH_LIMIT),
        ),
      );
      return unionByPath(perTag);
    }),
  );

  const merged = intersectByPath(perTokenUnions);
  const truncated = merged.length > SONG_SEARCH_LIMIT;
  const capped = truncated ? merged.slice(0, SONG_SEARCH_LIMIT) : merged;

  return {
    songs: mapSearchResults(capped),
    truncated,
  };
}

function mpcSearchAdapter(mpc: MPC): SongQueryClient {
  return {
    searchTag: async (tag, needle, limit) => {
      // mpc-js's tuple-form: it builds the wire command itself, including all
      // quoting and escaping. Identical to how mpd/albums.ts calls findAdd.
      return (await mpc.database.search(
        [[tag, needle]],
        0,
        limit,
      )) as unknown as RawSearchSong[];
    },
  };
}

export async function searchSongsViaMpc(
  mpc: MPC,
  query: string,
): Promise<SearchResult> {
  return searchSongs(mpcSearchAdapter(mpc), query);
}

// Minimal status shape we read before deciding whether to auto-play after
// appending a single song.
export interface PlaybackClient {
  status(): Promise<{ state?: 'play' | 'pause' | 'stop' }>;
  addId(file: string): Promise<number>;
  play(id: number): Promise<void>;
}

function mpcPlaybackAdapter(mpc: MPC): PlaybackClient {
  return {
    status: () => mpc.status.status() as unknown as Promise<{ state?: 'play' | 'pause' | 'stop' }>,
    // mpc-js exposes addId on currentPlaylist; returns the new songId.
    addId: async (file) =>
      (await mpc.currentPlaylist.addId(file)) as unknown as number,
    play: async (id) => {
      await mpc.playback.playId(id);
    },
  };
}

export type AddResult = { id: number; started: boolean };

// Append one song. If MPD was stopped at the moment of the call, also start
// playback on the just-added song so Enter feels useful even from a cold
// player. The window is left open by the caller; this function does NOT
// close anything.
export async function addSongToQueue(
  client: PlaybackClient,
  file: string,
): Promise<AddResult> {
  const status = await client.status();
  const id = await client.addId(file);
  if (status.state === 'stop') {
    await client.play(id);
    return { id, started: true };
  }
  return { id, started: false };
}

export async function addSongToQueueViaMpc(
  mpc: MPC,
  file: string,
): Promise<AddResult> {
  return addSongToQueue(mpcPlaybackAdapter(mpc), file);
}

// Atomic clear + add + play one song. Same `command_list_ok_begin` pattern as
// playAlbum so other MPD clients never see an empty queue mid-operation.
async function sendCommandList(mpc: MPC, commands: string[]): Promise<void> {
  const batch = ['command_list_ok_begin', ...commands, 'command_list_end'].join(
    '\n',
  );
  await mpc.sendCommand(batch);
}

export async function playSongNow(mpc: MPC, file: string): Promise<void> {
  const escaped = escapeFilterValue(file);
  await sendCommandList(mpc, ['clear', `add "${escaped}"`, 'play']);
}
