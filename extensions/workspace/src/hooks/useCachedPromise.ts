import { useCallback, useEffect, useRef, useState } from "react";

export function useCachedPromise<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  args: Args,
  options?: { initialData?: T },
): { data: T | undefined; isLoading: boolean; revalidate: () => void } {
  const [data, setData] = useState<T | undefined>(options?.initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const argsKey = JSON.stringify(args);
  const fnRef = useRef(fn);
  const argsRef = useRef(args);
  const resolvedKeyRef = useRef<string | null>(null);
  fnRef.current = fn;
  argsRef.current = args;

  useEffect(() => {
    let cancelled = false;
    if (resolvedKeyRef.current !== argsKey) {
      setIsLoading(true);
    }

    fnRef
      .current(...argsRef.current)
      .then((value) => {
        if (cancelled) {
          return;
        }

        resolvedKeyRef.current = argsKey;
        setData(value);
      })
      .catch(() => {
        // Keep previous data when the request fails.
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [argsKey, version]);

  const revalidate = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  return { data, isLoading, revalidate };
}
