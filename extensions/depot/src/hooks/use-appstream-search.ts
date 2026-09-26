import { useEffect, useRef, useState } from "react";
import { appStreamBackend } from "../backends/appstream";
import type { AppStreamComponent } from "../backends/appstream-parsing";
import { LatestRequest } from "../utils/latest-request";
import { isProcessAborted } from "../utils/process";
import { useDebouncedValue } from "./use-debounced-value";

const SEARCH_DEBOUNCE_MS = 250;

export function useAppStreamSearch(
  query: string,
  enabled = true,
): AppStreamComponent[] {
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, SEARCH_DEBOUNCE_MS);
  const latestRequest = useRef(new LatestRequest());
  const [components, setComponents] = useState<AppStreamComponent[]>([]);

  useEffect(() => {
    if (
      !enabled ||
      normalizedQuery !== debouncedQuery ||
      debouncedQuery.length < 2
    ) {
      latestRequest.current.cancel();
      setComponents([]);
      return;
    }

    const request = latestRequest.current.start();
    appStreamBackend.search(debouncedQuery, request.signal)
      .then((results) => {
        if (request.isCurrent()) setComponents(results);
      })
      .catch((error: unknown) => {
        if (!request.isCurrent() || isProcessAborted(error)) return;
        // AppStream is optional enrichment. Raw package-manager results remain
        // authoritative and should continue without a user-facing error.
        console.debug("AppStream enrichment unavailable", error);
        setComponents([]);
      });

    return () => latestRequest.current.cancel();
  }, [debouncedQuery, enabled, normalizedQuery]);

  return components;
}
