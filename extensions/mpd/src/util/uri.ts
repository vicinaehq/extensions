// Detect URIs that MPD treats as remote streams (webradio, http(s), mms,
// rtmp, etc.). Anything with a "<scheme>://" prefix other than file:// counts
// as a stream. Bare local paths like "Music/foo.mp3" are NOT streams.
//
// Used by the queue view to short-circuit album-art fetching (MPD has no
// embedded/folder art for stream URLs and the round-trips are slow) and to
// drive a different row layout (Title = current track / Subtitle = station).
export function isStreamUri(uri: string): boolean {
  if (!uri) return false;
  if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(uri)) return false;
  return !/^file:\/\//i.test(uri);
}

// Best-effort extraction of a stream URL's host for display fallback when
// MPD has supplied no Name / Title. Returns the empty string when the URI
// is not a valid URL.
export function streamHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return '';
  }
}
