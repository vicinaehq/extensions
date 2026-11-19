import { useEffect, useRef, useState } from "react";
import {
  EMPTY_SEARCH,
  runBackendSearch,
  type BackendSearch,
  type BackendSearchSnapshot,
} from "../utils/backend-search.ts";
import { LatestRequest } from "../utils/latest-request.ts";

/**
 * Searches one package backend. `query` must already be debounced, and
 * `search`/`describeError` must be stable between renders.
 */
export function useBackendSearch(
  query: string,
  search: BackendSearch,
  describeError: (error: unknown) => string,
  enabled: boolean,
): BackendSearchSnapshot {
  const latest = useRef(new LatestRequest());
  const [state, setState] = useState(EMPTY_SEARCH);

  useEffect(() => {
    const request = latest.current;
    runBackendSearch(request, enabled ? query : "", search, describeError, setState);
    return () => request.cancel();
  }, [describeError, enabled, query, search]);

  return state;
}
