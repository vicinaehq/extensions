// Pure, MPD-independent helpers for the song-search feature.
//
// Keeping these in util/ (rather than mpd/) means they have no dependency on
// mpc-js and can be exercised in plain unit tests.

export type RawSearchSong = {
  // mpc-js's Song object exposes `path` (not `file`), plus tag fields. We
  // intentionally use a narrow structural type so tests can fabricate inputs
  // without pulling in mpc-js types.
  path?: string;
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  date?: string;
  duration?: number;
};

export type Song = {
  // MPD-relative URI; this is the key for album-art lookups and `addid`.
  file: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  // Seconds. 0 when MPD didn't report a duration.
  duration: number;
};

// Split a query into whitespace-separated lowercase tokens. Empty / whitespace
// input yields an empty list.
export function splitTokens(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function extractYear(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const first4 = date.slice(0, 4);
  return /^\d{4}$/.test(first4) ? first4 : undefined;
}

// Map a single mpc-js search result into our narrower Song shape.
// Songs without a `path` are skipped by the caller (mapSearchResults).
export function mapSearchSong(raw: RawSearchSong): Song | undefined {
  if (!raw.path || raw.path.length === 0) return undefined;
  const artist = raw.albumArtist || raw.artist;
  return {
    file: raw.path,
    title: raw.title,
    artist: artist || undefined,
    album: raw.album || undefined,
    year: extractYear(raw.date),
    duration: typeof raw.duration === 'number' ? raw.duration : 0,
  };
}

export function mapSearchResults(raws: RawSearchSong[]): Song[] {
  const out: Song[] = [];
  for (const r of raws) {
    const m = mapSearchSong(r);
    if (m) out.push(m);
  }
  return out;
}
