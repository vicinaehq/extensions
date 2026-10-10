// Provenance + priority for queue-row icons. Stream icons can arrive from
// three async sources in any order; this resolver guarantees a stronger
// source always wins, regardless of which network response lands first.
// Local-file art uses source 'local' and never shares a URI with a stream.

export type ArtSource = 'local' | 'embedded' | 'webradiodb' | 'favicon';

export type ArtEntry = { path: string; source: ArtSource };

const PRIORITY: Record<ArtSource, number> = {
  // local and embedded share rank 3: a given URI is either a local file or a
  // stream, never both, so this tie is never exercised in practice.
  local: 3,
  embedded: 3,
  webradiodb: 2,
  favicon: 1,
};

// Return a record with `uri` set to {path, source}, UNLESS an existing entry
// is from a strictly higher-priority source (keep it) or is identical
// (same path and source) (return prev so React can skip the render).
// Never mutates `prev`.
export function mergeArt(
  prev: Record<string, ArtEntry>,
  uri: string,
  path: string,
  source: ArtSource,
): Record<string, ArtEntry> {
  const cur = prev[uri];
  if (cur) {
    if (PRIORITY[cur.source] > PRIORITY[source]) return prev;
    if (cur.path === path && cur.source === source) return prev;
  }
  return { ...prev, [uri]: { path, source } };
}
