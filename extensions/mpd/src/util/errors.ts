// Centralised error stringifier. The reason this exists: mpc-js rejects with
// a plain MPDError object literal `{ errorCode: number, errorMessage: string }`
// rather than an Error instance. Naively coercing such a value with `String(e)`
// produces "[object Object]", which is what users were seeing in the song
// search EmptyView. This helper extracts a useful message in every case.

export interface MPDErrorShape {
  errorCode?: unknown;
  errorMessage?: unknown;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const m = e as MPDErrorShape;
    if (typeof m.errorMessage === 'string' && m.errorMessage.length > 0) {
      if (typeof m.errorCode === 'number') {
        return `MPD [${m.errorCode}]: ${m.errorMessage}`;
      }
      return m.errorMessage;
    }
  }
  try {
    const s = String(e);
    // Guard against [object Object] sneaking through for unknown shapes.
    return s === '[object Object]' ? 'Unknown error' : s;
  } catch {
    return 'Unknown error';
  }
}
