import { useCallback, useEffect, useRef, useState } from "react";

export function useCachedPromise<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  args: Args,
  options?: { initialData?: T },
): { data: T | undefined; error: Error | undefined; isLoading: boolean; revalidate: () => void } {
  const [data, setData] = useState<T | undefined>(options?.initialData);
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const argsKey = JSON.stringify(args);
  const fnRef = useRef(fn);
  const argsRef = useRef(args);
  fnRef.current = fn;
  argsRef.current = args;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fnRef
      .current(...argsRef.current)
      .then((value) => {
        if (cancelled) {
          return;
        }

        setError(undefined);
        setData(value);
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }

        setError(caught instanceof Error ? caught : new Error("Request failed"));
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

  return { data, error, isLoading, revalidate };
}
