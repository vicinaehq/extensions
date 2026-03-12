import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import { parseIconIndexFile, type IconIndex } from "../schemas/icon-data";

let tokenDictionary: string[] = [];
let fuseInstance: Fuse<IconIndex> | null = null;

const FUSE_OPTIONS: IFuseOptions<IconIndex> = {
	keys: [
		{ name: "displayName", weight: 0.3 },
		{ name: "id", weight: 0.5 },
		{ name: "searchTokens", weight: 0.8 },
		{ name: "pack", weight: 1 },
	],
	threshold: 0.4,
	location: 0,
	distance: 100,
	ignoreLocation: false,
	ignoreFieldNorm: false,
	fieldNormWeight: 1,
	minMatchCharLength: 2,
	shouldSort: true,
	includeScore: true,
	findAllMatches: false,
	useExtendedSearch: false,
};

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

export function useIconData(shouldLoad: boolean) {
	const indexQuery = useQuery({
		queryKey: ["iconIndex"],
		queryFn: loadIconIndex,
		enabled: shouldLoad,
	});

	return {
		iconIndex: indexQuery.data ?? [],
		isLoading: indexQuery.isLoading,
		fuseInstance,
	};
}

export { tokenDictionary };
export type { IconIndex };
