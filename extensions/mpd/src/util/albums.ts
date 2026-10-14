export type SongLike = {
  path?: string;
  album?: string;
  artist?: string;
  albumArtist?: string;
  date?: string;
  duration?: number;
  lastModified?: Date;
};

export type Album = {
  name: string;
  artist: string;
  year?: string;
  totalDuration: number;
  songCount: number;
  sampleUri: string;
  lastModified: Date;
};

function extractYear(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const first4 = date.slice(0, 4);
  return /^\d{4}$/.test(first4) ? first4 : undefined;
}

function resolveArtist(s: SongLike): string {
  return s.albumArtist || s.artist || 'Unknown Artist';
}

// Token-AND substring matcher: every whitespace-separated token in `query`
// must appear (case-insensitively) somewhere in the album's name, artist, or
// year. An empty query matches everything.
export function matchesAlbumQuery(album: Album, query: string): boolean {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [album.name, album.artist, album.year ?? '']
    .join(' ')
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export function aggregateAlbums(songs: SongLike[]): Album[] {
  const byName = new Map<string, Album>();
  const order: string[] = [];

  for (const s of songs) {
    if (!s.album || !s.path) continue;
    const lm = s.lastModified ?? new Date(0);
    const dur = typeof s.duration === 'number' ? s.duration : 0;
    const existing = byName.get(s.album);
    if (!existing) {
      byName.set(s.album, {
        name: s.album,
        artist: resolveArtist(s),
        year: extractYear(s.date),
        totalDuration: dur,
        songCount: 1,
        sampleUri: s.path,
        lastModified: lm,
      });
      order.push(s.album);
    } else {
      existing.totalDuration += dur;
      existing.songCount += 1;
      if (lm.getTime() > existing.lastModified.getTime()) {
        existing.lastModified = lm;
      }
    }
  }

  return order.map((name) => byName.get(name)!);
}
