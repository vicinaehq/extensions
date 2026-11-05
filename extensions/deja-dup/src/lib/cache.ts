import { useEffect, useState } from "react";
import { Cache } from "@vicinae/api";

const store = new Cache({ namespace: "deja-dup", capacity: 25 * 1024 * 1024 });

export function readCache<T>(key: string): T | null {
  const raw = store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    store.set(key, JSON.stringify(value));
  } catch {
    // cache write failures are non-fatal
  }
}

export interface CachedResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  /** True while the first-ever (uncached) fetch is running. */
  isFirstLoad: boolean;
  revalidate: () => void;
}

/**
 * Stale-while-revalidate: returns cached data instantly (from disk, synchronously),
 * then refreshes in the background and updates. Makes repeat navigation feel instant
 * even though each restic call over a cloud backend takes several seconds.
 */
export function useCached<T>(key: string, fetcher: () => Promise<T>): CachedResult<T> {
  const [data, setData] = useState<T | null>(() => readCache<T>(key));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        writeCache(key, result);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  return {
    data,
    isLoading,
    error,
    isFirstLoad: isLoading && data === null,
    revalidate: () => setNonce((n) => n + 1),
  };
}
