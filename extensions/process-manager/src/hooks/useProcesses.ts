import { useState, useEffect } from 'react';
import si from 'systeminformation';
import { showToast, Toast, getPreferenceValues } from '@vicinae/api';
import { getErrorMessage } from '../utils';
import type { PreferenceValues } from '../types/preferences';

export interface Process {
  pid: number;
  parentPid: number;
  name: string;
  cpu: number;
  mem: number;
  memVsz: number;
  memRss: number;
  command: string;
  params: string;
  path: string;
  user: string;
}

export function useProcesses() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'cpu' | 'memory'>('cpu');

  const preferences = getPreferenceValues<PreferenceValues>();
  const refreshInterval = parseInt(preferences['refresh-interval']);
  const showSystemProcesses = preferences['show-system-processes'];
  const processLimit = parseInt(preferences['process-limit']);

  // Set initial sort from preferences
  useEffect(() => {
    if (preferences['sort-by-memory']) {
      setSortBy('memory');
    }
  }, []);

  async function fetchProcesses() {
    try {
      const processList = await si.processes();
      let procs = processList.list as Process[];

      if (!showSystemProcesses) {
        procs = procs.filter((p) => p.user !== 'root' && !p.name.startsWith('['));
      }

      procs.sort((a, b) => sortBy === 'memory' ? b.memRss - a.memRss : b.cpu - a.cpu);
      procs = procs.slice(0, processLimit);

      setProcesses(procs);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      showToast({
        title: 'Failed to fetch processes',
        style: Toast.Style.Failure,
        message: getErrorMessage(err),
      });
    }
  }

  // Fetch on mount and set up interval
  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, refreshInterval);
    return () => clearInterval(interval);
  }, [showSystemProcesses, sortBy, processLimit, refreshInterval]);

  return {
    processes,
    isLoading,
    sortBy,
    setSortBy,
    refreshProcesses: fetchProcesses,
  };
}
