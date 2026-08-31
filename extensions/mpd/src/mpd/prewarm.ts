// Background art prewarmer.
//
// Purpose: kick off album-art fetches without blocking any UI flow, swallow
// errors, and coalesce concurrent calls for the same URI set so a rapid
// re-entry (e.g. a quick refresh) doesn't open two MPD connections in
// parallel.
//
// The art batch is injectable for testing; production wires it to
// fetchAlbumArtBatchViaMpc.

import {
  fetchAlbumArtBatchViaMpc,
  type FetchAlbumArtBatchResult,
} from './albumart.js';

export interface PrewarmSummary {
  resolved: number;
  missing: number;
}

export interface PrewarmOptions {
  // Injected for tests. Defaults to fetchAlbumArtBatchViaMpc.
  // Matches the production signature: a sync-grouped `cached` map for hits
  // plus a streamed `onMiss` channel for cache-miss completions.
  batch?: (
    uris: string[],
    onMiss: (uri: string, path: string | null) => void,
  ) => Promise<FetchAlbumArtBatchResult>;
}

// Tracks in-flight prewarms by a deterministic key so concurrent calls with
// the same URI set share work.
const inflight = new Map<string, Promise<PrewarmSummary>>();

export function _resetPrewarmStateForTests(): void {
  inflight.clear();
}

function keyFor(uris: string[]): string {
  // Sort + join. Two callers asking for the same set in different orders
  // collapse to the same key.
  return [...uris].sort().join('\n');
}

export async function prewarmAlbumArt(
  uris: string[],
  opts: PrewarmOptions = {},
): Promise<PrewarmSummary> {
  if (uris.length === 0) {
    return { resolved: 0, missing: 0 };
  }
  const key = keyFor(uris);
  const existing = inflight.get(key);
  if (existing) return existing;

  const batch = opts.batch ?? fetchAlbumArtBatchViaMpc;

  const promise = (async (): Promise<PrewarmSummary> => {
    let resolvedMisses = 0;
    let missingMisses = 0;
    try {
      const result = await batch(uris, (_uri, path) => {
        if (path) {
          resolvedMisses++;
        } else {
          missingMisses++;
        }
      });
      // Cached hits are returned grouped, not streamed. They count toward
      // "resolved" because they're already on disk.
      const resolved = result.cached.size + resolvedMisses;
      // Anything the batch didn't report on (e.g. early bailout) is treated
      // as missing for the summary.
      const counted = result.cached.size + resolvedMisses + missingMisses;
      const missing = missingMisses + Math.max(0, uris.length - counted);
      return { resolved, missing };
    } catch {
      // Failure mode: count anything not yet resolved as missing. The caller
      // doesn't get an exception — prewarm is fire-and-forget.
      const counted = resolvedMisses + missingMisses;
      const remaining = Math.max(0, uris.length - counted);
      return { resolved: resolvedMisses, missing: missingMisses + remaining };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
