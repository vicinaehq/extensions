import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import fuseOptions from "../fuse-options.json";
import { parseIconIndexFile, type IconIndex } from "../schemas/icon-data";

let tokenDictionary: string[] = [];
let fuseInstance: Fuse<IconIndex> | null = null;

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

export function useIconData() {
  const indexQuery = useQuery({
    queryKey: ["iconIndex"],
    queryFn: loadIconIndex,
  });

  return {
    iconIndex: indexQuery.data ?? [],
    isLoading: indexQuery.isLoading,
    fuseInstance,
  };
}

export { tokenDictionary };
export type { IconIndex };
