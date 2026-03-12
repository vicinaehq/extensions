import { useEffect, useState } from "react";
import {
	ensureIconIndexLoaded,
	getCachedIconIndex,
	getFuseInstance,
	type IconIndex,
} from "../icon-index-store";

export function useIconData() {
  const [iconIndex, setIconIndex] = useState<IconIndex[]>(
    () => getCachedIconIndex() ?? [],
  );
  const [isLoading, setIsLoading] = useState(getCachedIconIndex() === null);

  useEffect(() => {
    const cached = getCachedIconIndex();
    if (cached) {
      setIconIndex(cached);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);

    ensureIconIndexLoaded()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setIconIndex(data);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    iconIndex,
    isLoading,
    fuseInstance: getFuseInstance(),
  };
}

export type { IconIndex };
