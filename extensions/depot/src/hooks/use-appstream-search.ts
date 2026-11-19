import { useEffect, useRef, useState } from "react";
import { appStreamBackend } from "../backends/appstream.ts";
import type { AppStreamComponent } from "../backends/appstream-parsing.ts";
import { isSearchableQuery } from "../utils/backend-search.ts";
import { LatestRequest } from "../utils/latest-request.ts";
import { isProcessAborted } from "../utils/process.ts";

export interface AppStreamSearchState {
  components: AppStreamComponent[];
  isLoading: boolean;
}

/** Optional enrichment for an already-debounced query; never reports errors. */
export function useAppStreamSearch(
  query: string,
  enabled = true,
): AppStreamSearchState {
  const latestRequest = useRef(new LatestRequest());
  const [state, setState] = useState<AppStreamSearchState>({
    components: [],
    isLoading: false,
  });

  useEffect(() => {
    const latest = latestRequest.current;
    if (!enabled || !isSearchableQuery(query)) {
      latest.cancel();
      setState({ components: [], isLoading: false });
      return;
    }

    const request = latest.start();
    setState((current) => ({ ...current, isLoading: true }));
    appStreamBackend.search(query, request.signal)
      .then((components) => {
        if (request.isCurrent()) setState({ components, isLoading: false });
      })
      .catch((error: unknown) => {
        if (!request.isCurrent() || isProcessAborted(error)) return;
        // Raw package-manager results remain authoritative without AppStream.
        console.debug("AppStream enrichment unavailable", error);
        setState({ components: [], isLoading: false });
      });

    return () => latest.cancel();
  }, [enabled, query]);

  return state;
}
