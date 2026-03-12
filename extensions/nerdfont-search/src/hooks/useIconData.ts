import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import {
	parseIconIndexFile,
	parseGlyphnames,
	type GlyphRecord,
	type IconIndex,
} from "../schemas/icon-data";

let cachedGlyphnames: GlyphRecord | null = null;
let tokenDictionary: string[] = [];
let fuseInstance: Fuse<IconIndex> | null = null;

async function loadGlyphnames(): Promise<GlyphRecord> {
	if (cachedGlyphnames) {
		return cachedGlyphnames;
	}

	const glyphnamesData = await import("../../assets/glyphnames.json");
	cachedGlyphnames = parseGlyphnames(glyphnamesData.default);
	return cachedGlyphnames;
}

async function loadIconIndex(): Promise<IconIndex[]> {
	const indexData = await import("../../assets/icon-index.json");
	const data = parseIconIndexFile(indexData.default);

	tokenDictionary = data.dictionary;

	const decodedIndex = data.icons.map((icon) => ({
		...icon,
		searchTokens: icon.searchTokens.map((idx) => tokenDictionary[idx]),
	}));

	fuseInstance = new Fuse(decodedIndex, {
		// Keys with weights (LOWER weight = MORE important!)
		keys: [
			{ name: "displayName", weight: 0.3 }, // Most important (exact name matches)
			{ name: "id", weight: 0.5 }, // Very important (icon IDs)
			{ name: "searchTokens", weight: 0.8 }, // Important (keywords/synonyms)
			{ name: "pack", weight: 1 }, // Least important (pack name)
		],

		// Fuzzy matching controls
		threshold: 0.4, // Balance between strict and fuzzy (0.0 = perfect, 1.0 = anything)
		location: 0, // Expect match at start of string
		distance: 100, // Allow matches within 100 chars of location
		ignoreLocation: false, // Consider location in scoring (start = better score)

		// Field length normalization (shorter fields with matches score better)
		ignoreFieldNorm: false, // Use field length in scoring
		fieldNormWeight: 1, // Standard field length normalization

		// Search behavior
		minMatchCharLength: 2, // Ignore single character matches
		shouldSort: true, // Let Fuse.js sort by relevance (CRITICAL!)
		includeScore: true, // Include scores for debugging
		findAllMatches: false, // Stop at first perfect match (faster)
		useExtendedSearch: false, // Standard search mode
	});

	return decodedIndex;
}

export function useIconData(shouldLoad: boolean) {
	const indexQuery = useQuery({
		queryKey: ["iconIndex"],
		queryFn: loadIconIndex,
		enabled: shouldLoad,
	});

	const glyphnamesQuery = useQuery({
		queryKey: ["glyphnames"],
		queryFn: loadGlyphnames,
		enabled: shouldLoad,
	});

	return {
		iconIndex: indexQuery.data ?? [],
		glyphnames: glyphnamesQuery.data ?? null,
		isLoading: indexQuery.isLoading || glyphnamesQuery.isLoading,
		fuseInstance,
	};
}

export { tokenDictionary };
export type { GlyphRecord, IconIndex };
