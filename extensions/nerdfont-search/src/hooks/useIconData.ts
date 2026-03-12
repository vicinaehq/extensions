import { useEffect, useState } from "react";
import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import fuseOptions from "../fuse-options.json";
import { parseIconIndexFile, type IconIndex } from "../schemas/icon-data";

let tokenDictionary: string[] = [];
let fuseInstance: Fuse<IconIndex> | null = null;
let cachedIconIndex: IconIndex[] | null = null;
let iconIndexLoadPromise: Promise<IconIndex[]> | null = null;

const FUSE_OPTIONS: IFuseOptions<IconIndex> = fuseOptions;

async function loadIconIndex(): Promise<IconIndex[]> {
  const indexData = await import("../../assets/icon-index.json");
  const data = parseIconIndexFile(indexData.default);

  tokenDictionary = data.dictionary;

  const decodedIndex = data.icons.map((icon) => ({
    ...icon,
    searchTokens: icon.searchTokens.map((idx) => tokenDictionary[idx]),
  }));

  fuseInstance = new Fuse(decodedIndex, FUSE_OPTIONS);

  return decodedIndex;
}

function ensureIconIndexLoaded(): Promise<IconIndex[]> {
  if (cachedIconIndex) {
    return Promise.resolve(cachedIconIndex);
  }

  if (iconIndexLoadPromise) {
    return iconIndexLoadPromise;
  }

  iconIndexLoadPromise = loadIconIndex()
    .then((data) => {
      cachedIconIndex = data;
      return data;
    })
    .finally(() => {
      iconIndexLoadPromise = null;
    });

  return iconIndexLoadPromise;
}

export function useIconData() {
  const [iconIndex, setIconIndex] = useState<IconIndex[]>(() => cachedIconIndex ?? []);
  const [isLoading, setIsLoading] = useState(cachedIconIndex === null);

  useEffect(() => {
    if (cachedIconIndex) {
      setIconIndex(cachedIconIndex);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);

    void ensureIconIndexLoaded()
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
    fuseInstance,
  };
}

export { tokenDictionary };
export type { IconIndex };
