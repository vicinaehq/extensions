import { useEffect, useRef, useState } from "react";
import type { FlatpakBackend } from "../backends/flatpak";
import { operationErrorMessage } from "../errors.ts";
import type { SoftwareItem } from "../types";
import { LatestRequest } from "../utils/latest-request";
import { isProcessAborted } from "../utils/process";
import { useDebouncedValue } from "./use-debounced-value";

const SEARCH_DEBOUNCE_MS = 250;

export interface FlatpakSearchState {
  results: SoftwareItem[];
  isLoading: boolean;
  error: string | undefined;
  warning: string | undefined;
  markInstalled(id: string): void;
}

export function useFlatpakSearch(
  query: string,
  backend: FlatpakBackend,
  enabled = true,
): FlatpakSearchState {
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, SEARCH_DEBOUNCE_MS);
  const latestRequest = useRef(new LatestRequest());
  const [results, setResults] = useState<SoftwareItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();

  useEffect(() => {
    if (!enabled) {
      latestRequest.current.cancel();
      setResults([]);
      setError(undefined);
      setWarning(undefined);
      setIsLoading(false);
      return;
    }

    if (normalizedQuery !== debouncedQuery) {
      latestRequest.current.cancel();
      setResults([]);
      setError(undefined);
      setWarning(undefined);
      setIsLoading(normalizedQuery.length >= 2);
      return;
    }

    if (debouncedQuery.length < 2) {
      latestRequest.current.cancel();
      setResults([]);
      setError(undefined);
      setWarning(undefined);
      setIsLoading(false);
      return;
    }

    const request = latestRequest.current.start();
    setIsLoading(true);
    setError(undefined);
    setWarning(undefined);

    backend.searchWithStatus(debouncedQuery, request.signal)
      .then((response) => {
        if (!request.isCurrent()) return;
        setResults(response.items);
        setWarning(response.warning);
      })
      .catch((searchError: unknown) => {
        if (!request.isCurrent() || isProcessAborted(searchError)) return;
        console.error("Flatpak search failed", searchError);
        setResults([]);
        setError(operationErrorMessage(searchError, "Flatpak search failed"));
      })
      .finally(() => {
        if (request.isCurrent()) setIsLoading(false);
      });

    return () => latestRequest.current.cancel();
  }, [backend, debouncedQuery, enabled, normalizedQuery]);

  return {
    results,
    isLoading,
    error,
    warning,
    markInstalled: (id: string) => {
      setResults((packages) =>
        packages.map((pkg) => pkg.id === id ? { ...pkg, installed: true } : pkg),
      );
    },
  };
}
