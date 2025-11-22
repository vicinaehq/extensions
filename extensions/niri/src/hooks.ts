import { useEffect, useState } from 'react';
import { execAsync, handleError } from './utils';

function useNiriData<T>(command: string, errorMessage: string): [T[] | Record<string, T>, boolean] {
  const [data, setData] = useState<T[] | Record<string, T>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const { stdout } = await execAsync(command);
        const parsed = JSON.parse(stdout);
        setData(parsed);
      } catch (error) {
        handleError(errorMessage, error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [command, errorMessage]);

  return [data, loading];
}

function useRefreshData<T>(command: string, errorMessage: string) {
  return async (setData: (data: T[] | Record<string, T>) => void) => {
    try {
      const { stdout } = await execAsync(command);
      const parsed = JSON.parse(stdout);
      setData(parsed);
    } catch (error) {
      handleError(errorMessage, error);
    }
  };
}

export function useNiriArrayData<T>(
  command: string,
  errorMessage: string
): [T[], boolean, () => Promise<void>] {
  const [data, loading] = useNiriData<T>(command, errorMessage);
  const [currentData, setCurrentData] = useState<T[]>([]);
  const refreshData = useRefreshData<T>(command, errorMessage);

  // Sync currentData with data when data loads
  useEffect(() => {
    const arrayData = data as T[];
    if (Array.isArray(arrayData) && arrayData.length > 0 && currentData.length === 0) {
      setCurrentData(arrayData);
    }
  }, [data, currentData]);

  const handleRefresh = async () => {
    await refreshData((newData) => {
      setCurrentData(Array.isArray(newData) ? newData : []);
    });
  };

  const displayData = currentData.length > 0 ? currentData : (data as T[]);

  return [displayData, loading, handleRefresh];
}

export function useNiriObjectData<T>(
  command: string,
  errorMessage: string
): [Record<string, T>, boolean, () => Promise<void>] {
  const [data, loading] = useNiriData<T>(command, errorMessage);
  const [currentData, setCurrentData] = useState<Record<string, T>>({});
  const refreshData = useRefreshData<T>(command, errorMessage);

  // Sync currentData with data when data loads
  useEffect(() => {
    const objectData = data as Record<string, T>;
    if (Object.keys(objectData).length > 0 && Object.keys(currentData).length === 0) {
      setCurrentData(objectData);
    }
  }, [data, currentData]);

  const handleRefresh = async () => {
    await refreshData((newData) => {
      setCurrentData(newData as Record<string, T>);
    });
  };

  const displayData =
    Object.keys(currentData).length > 0 ? currentData : (data as Record<string, T>);

  return [displayData, loading, handleRefresh];
}
