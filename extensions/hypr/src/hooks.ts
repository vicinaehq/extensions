import { useEffect, useState } from 'react';
import { getHyprctlJson, handleError } from './utils';

export function useHyprctlData<T>(
  command: string,
  fallback: T,
  errorTitle: string
): [T, boolean, () => Promise<void>] {
  const [data, setData] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);

    try {
      const result = await getHyprctlJson<T>(command);
      setData(result);
    } catch (error) {
      handleError(errorTitle, error);
      setData(fallback);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [command]);

  return [data, isLoading, refresh];
}
