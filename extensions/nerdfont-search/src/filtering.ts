import { MIN_SEARCH_LENGTH, PACK_FILTER_ALL, SEARCH_RESULT_LIMIT } from "./constants";
import type { IconIndex } from "./schemas/icon-data";

const SCORE_EPSILON = 0.000001;

function sortFuseResultsByScoreThenId<T extends { id: string }>(
	searchResults: Array<{ score?: number; item: T }>,
) {
	return [...searchResults].sort((a, b) => {
		const scoreDiff = (a.score || 0) - (b.score || 0);
		if (Math.abs(scoreDiff) < SCORE_EPSILON) {
			return a.item.id.localeCompare(b.item.id);
		}
		return scoreDiff;
	});
}

function filterIconIndex({
	iconIndex,
	fuseInstance,
	searchText,
	selectedPack,
}: {
	iconIndex: IconIndex[];
	fuseInstance: { search: (query: string) => Array<{ score?: number; item: IconIndex }> } | null;
	searchText: string;
	selectedPack: string;
}): IconIndex[] {
	if (iconIndex.length === 0) {
		return [];
	}

	if (searchText.length < MIN_SEARCH_LENGTH) {
		if (selectedPack === PACK_FILTER_ALL) {
			return [];
		}

		return iconIndex
			.filter((icon) => icon.pack === selectedPack)
			.sort((a, b) => a.displayName.localeCompare(b.displayName))
			.slice(0, SEARCH_RESULT_LIMIT);
	}

	if (!fuseInstance) {
		return [];
	}

	let searchResults = fuseInstance.search(searchText);

	if (selectedPack !== PACK_FILTER_ALL) {
		searchResults = searchResults.filter((result) => result.item.pack === selectedPack);
	}

	return sortFuseResultsByScoreThenId(searchResults)
		.slice(0, SEARCH_RESULT_LIMIT)
		.map((result) => result.item);
}

export { filterIconIndex, sortFuseResultsByScoreThenId };
