import { useEffect, useRef, useState } from "react";
import { aptBackend } from "../backends/apt";
import type { SoftwarePackage } from "../types";
import { LatestRequest } from "../utils/latest-request";
import { isProcessAborted } from "../utils/process";
import { useDebouncedValue } from "./use-debounced-value";

const SEARCH_DEBOUNCE_MS = 250;

export interface AptSearchState {
  results: SoftwarePackage[];
  isLoading: boolean;
  error: string | undefined;
  markInstalled(id: string): void;
}

export function useAptSearch(
  query: string,
  enabled = true,
): AptSearchState {
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

    aptBackend.search(debouncedQuery, request.signal)
      .then((packages) => {
        if (request.isCurrent()) setResults(packages);
      })
      .catch((searchError: unknown) => {
        if (!request.isCurrent() || isProcessAborted(searchError)) return;
        console.error("APT search failed", searchError);
        setResults([]);
        setError("APT search failed. Check that the local APT metadata is available.");
      })
      .finally(() => {
        if (request.isCurrent()) setIsLoading(false);
      });

    return () => latestRequest.current.cancel();
  }, [debouncedQuery, enabled, normalizedQuery]);

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
