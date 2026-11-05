import { useCallback, useMemo } from "react";

import { peekCachedState, useCachedState, isCachedStateHydrated } from "@/hooks/useCachedState";
import { STORAGE_KEY_USAGE_STATS } from "@/utils/constants";
import {
  buildUsageSnapshot,
  createEmptyUsageStore,
  normalizeUsageStore,
  recordOpen,
  type UsageSnapshot,
} from "@/utils/usage";
import type { UsageStore } from "@/types";

export function useUsageStats() {
  const [rawStore, setStore, hydrated] = useCachedState<UsageStore>(
    STORAGE_KEY_USAGE_STATS,
    createEmptyUsageStore(),
  );

  const store = useMemo(() => normalizeUsageStore(rawStore), [rawStore]);
  const snapshot = useMemo(() => buildUsageSnapshot(store), [store]);

  const recordProjectOpen = useCallback(
    async (projectPath: string) => {
      if (!isCachedStateHydrated(STORAGE_KEY_USAGE_STATS)) {
        return;
      }

      setStore(recordOpen(normalizeUsageStore(peekCachedState(STORAGE_KEY_USAGE_STATS, createEmptyUsageStore())), projectPath));
    },
    [setStore],
  );

  const replaceUsage = useCallback(
    async (next: UsageStore | null | undefined) => {
      setStore(normalizeUsageStore(next ?? createEmptyUsageStore()));
    },
    [setStore],
  );

  const clearUsage = useCallback(async () => {
    setStore(createEmptyUsageStore());
  }, [setStore]);

  return {
    clearUsage,
    hydrated,
    recordProjectOpen,
    replaceUsage,
    snapshot,
    store,
  };
}
