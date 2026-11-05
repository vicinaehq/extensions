import { useEffect, useRef, useState } from "react";
import {
  FlatpakOperationError,
  type FlatpakBackend,
} from "../backends/flatpak";
import type { SoftwarePackage } from "../types";
import { LatestRequest } from "../utils/latest-request";
import { isProcessAborted } from "../utils/process";
import { useDebouncedValue } from "./use-debounced-value";

const SEARCH_DEBOUNCE_MS = 250;

export interface FlatpakSearchState {
  results: SoftwarePackage[];
  isLoading: boolean;
  error: string | undefined;
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
  const [results, setResults] = useState<SoftwarePackage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!enabled) {
      latestRequest.current.cancel();
      setResults([]);
      setError(undefined);
      setIsLoading(false);
      return;
    }

    if (normalizedQuery !== debouncedQuery) {
      latestRequest.current.cancel();
      setResults([]);
      setError(undefined);
      setIsLoading(normalizedQuery.length >= 2);
      return;
    }

    if (debouncedQuery.length < 2) {
      latestRequest.current.cancel();
      setResults([]);
      setError(undefined);
      setIsLoading(false);
      return;
    }

    const request = latestRequest.current.start();
    setIsLoading(true);
    setError(undefined);

    backend.search(debouncedQuery, request.signal)
      .then((packages) => {
        if (request.isCurrent()) setResults(packages);
      })
      .catch((searchError: unknown) => {
        if (!request.isCurrent() || isProcessAborted(searchError)) return;
        console.error("Flatpak search failed", searchError);
        setResults([]);
        setError(searchError instanceof FlatpakOperationError
          ? searchError.message
          : "Flatpak search failed");
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
    markInstalled: (id: string) => {
      setResults((packages) =>
        packages.map((pkg) => pkg.id === id ? { ...pkg, installed: true } : pkg),
      );
    },
  };
}
