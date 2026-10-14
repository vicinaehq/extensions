import type { MPC } from 'mpc-js';

export type RawPlaylistItem = {
  id?: number;
  position?: number;
  path?: string;
  title?: string;
  // MPD's `Name` tag. For webradio streams this is the station name; ICY
  // metadata typically lands in `title` and the station name in `name`.
  name?: string;
  artist?: string;
  album?: string;
  duration?: number;
  track?: string;
};

export type RawStatus = {
  state?: 'play' | 'pause' | 'stop';
  songId?: number;
};

export type QueueItem = {
  id: number;
  pos: number;
  file: string;
  title?: string;
  // MPD's `Name` tag. Populated for webradio streams (station name) and
  // occasionally for tagged files; we surface it so the queue view can fall
  // back to it when `title` is absent.
  name?: string;
  artist?: string;
  album?: string;
  duration: number;
  // 1-based album track number, parsed from MPD's `Track` tag.
  // Handles "3", "03", and "3/11" forms; undefined if missing or unparseable.
  track?: number;
};

// Live metadata for the currently playing song.
//
// MPD's `playlistinfo` returns only the static metadata that was stored in
// the queue at add-time. For webradio streams added with `mpc add http://…`
// this is usually just `file:` — no station name, no current track. The
// live ICY metadata only surfaces in `currentsong` (and `status`). We pull
// it out separately so the queue view can overlay it onto the playing row.
export type CurrentSong = {
  id: number;
  title?: string;
  name?: string;
};

export type QueueState = {
  items: QueueItem[];
  currentSongId: number | null;
  state: 'play' | 'pause' | 'stop';
  currentSong: CurrentSong | null;
};

// Parse MPD's Track tag into a 1-based integer.
// Accepts "3", "03", "3/11"; rejects empty, "???", "/11", etc.
function parseTrack(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(\d+)/);
  if (!m) return undefined;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function mapQueueState(
  items: RawPlaylistItem[],
  status: RawStatus,
  current?: RawPlaylistItem | null,
): QueueState {
  const mapped: QueueItem[] = [];
  for (const it of items) {
    if (
      typeof it.id !== 'number' ||
      typeof it.position !== 'number' ||
      typeof it.path !== 'string'
    ) {
      continue;
    }
    mapped.push({
      id: it.id,
      pos: it.position,
      file: it.path,
      title: it.title,
      name: it.name,
      artist: it.artist,
      album: it.album,
      duration: typeof it.duration === 'number' ? it.duration : 0,
      track: parseTrack(it.track),
    });
  }

  // Build CurrentSong only when MPD's `currentsong` reply actually has an id.
  // When the player is stopped, MPD typically returns an empty currentsong;
  // we surface that as null so the caller doesn't try to overlay stale data.
  let currentSong: CurrentSong | null = null;
  if (current && typeof current.id === 'number') {
    currentSong = {
      id: current.id,
      title: current.title,
      name: current.name,
    };
  }

  return {
    items: mapped,
    currentSongId: typeof status.songId === 'number' ? status.songId : null,
    state: status.state ?? 'stop',
    currentSong,
  };
}

export async function getQueue(mpc: MPC): Promise<QueueState> {
  // `currentsong` is the only command that returns the live ICY-updated
  // metadata for the playing stream. We fetch it in the same parallel batch
  // as playlistinfo + status so the round-trip cost is one RTT, not three.
  // It's expected to be undefined/empty when MPD is stopped — we tolerate
  // either shape.
  const [items, status, current] = await Promise.all([
    mpc.currentPlaylist.playlistInfo(),
    mpc.status.status(),
    mpc.status
      .currentSong()
      .catch(() => undefined) as Promise<RawPlaylistItem | undefined>,
  ]);
  return mapQueueState(
    items as RawPlaylistItem[],
    status as RawStatus,
    current ?? null,
  );
}

export async function playSong(mpc: MPC, id: number): Promise<void> {
  await mpc.playback.playId(id);
}

export async function removeSong(mpc: MPC, id: number): Promise<void> {
  await mpc.currentPlaylist.deleteId(id);
}
