import { useEffect, useMemo, useState } from "react";
import { CacheAdapter } from "../utils/cache";

/**
 * Returns a [selectedModel, setSelectedModel] pair that persists the
 * selection to cache. Skips writing to cache while models are still loading.
 */
export function useCachedModelSelection(
  cacheKey: string,
  defaultOption: string,
  isModelsLoading: boolean,
  initialOverride?: string,
): [string, React.Dispatch<React.SetStateAction<string>>] {
  const cache = useMemo(() => new CacheAdapter(cacheKey), [cacheKey]);
  const [selected, setSelected] = useState<string>(initialOverride ?? cache.get() ?? defaultOption);

  useEffect(() => {
    if (!isModelsLoading) {
      cache.set(selected);
    }
  }, [selected, isModelsLoading, cache]);

  return [selected, setSelected];
}
