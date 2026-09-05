import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Minimal local replacement for `@raycast/utils`'s usePromise.
 *
 * The Vicinae native API does not re-export usePromise, so we provide it here
 * instead of pulling in the (Raycast-only) @raycast/utils package. The shape
 * matches what the rest of the extension already expects:
 *   { data, isLoading, revalidate }
 */
export function usePromise<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  options?: { execute?: boolean },
): { data: T | undefined; isLoading: boolean; revalidate: () => Promise<void> } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);
  const execute = options?.execute ?? true;

  const run = useCallback(async () => {
    if (!execute) {
      setData(undefined);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await fn();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (error) {
      console.error("usePromise error:", error);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    run();
    return () => {
      mountedRef.current = false;
    };
  }, [run]);

  return { data, isLoading, revalidate: run };
}
