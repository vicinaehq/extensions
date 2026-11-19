import type { SoftwareItem } from "../types.ts";
import type { LatestRequest } from "./latest-request.ts";
import { isProcessAborted } from "./process.ts";

const MIN_SEARCH_QUERY_LENGTH = 2;

export interface BackendSearchResponse {
  items: SoftwareItem[];
  warning?: string;
}

export type BackendSearch = (
  query: string,
  signal: AbortSignal,
) => Promise<BackendSearchResponse>;

export interface BackendSearchSnapshot {
  results: SoftwareItem[];
  isLoading: boolean;
  error?: string;
  warning?: string;
}

export const EMPTY_SEARCH: BackendSearchSnapshot = { results: [], isLoading: false };

export function isSearchableQuery(query: string): boolean {
  return query.length >= MIN_SEARCH_QUERY_LENGTH;
}

/**
 * Starts a search for an already-debounced query. Previous results stay
 * visible while loading; responses from replaced requests are discarded.
 */
export function runBackendSearch(
  latest: LatestRequest,
  query: string,
  search: BackendSearch,
  describeError: (error: unknown) => string,
  apply: (update: (current: BackendSearchSnapshot) => BackendSearchSnapshot) => void,
): void {
  if (!isSearchableQuery(query)) {
    latest.cancel();
    apply(() => EMPTY_SEARCH);
    return;
  }

  const request = latest.start();
  apply((current) => ({ ...current, isLoading: true }));
  search(query, request.signal).then(
    (response) => {
      if (!request.isCurrent()) return;
      apply(() => ({
        results: response.items,
        warning: response.warning,
        isLoading: false,
      }));
    },
    (error: unknown) => {
      if (!request.isCurrent() || isProcessAborted(error)) return;
      console.error("Software search failed", error);
      apply(() => ({ results: [], error: describeError(error), isLoading: false }));
    },
  );
}
