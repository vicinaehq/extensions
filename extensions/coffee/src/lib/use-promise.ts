import { useEffect, useState } from "react";

export function usePromise<T>(fn: () => T | Promise<T>): {
  value: T | undefined;
  error: Error | undefined;
  loading: boolean;
} {
  const [value, setValue] = useState<T | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.resolve()
      .then(fn)
      .then((result) => {
        if (cancelled) return;
        setError(undefined);
        setValue(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fn]);

  return { value, error, loading };
}
