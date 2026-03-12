import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { PACK_FILTER_ALL, SEARCH_RESULT_LIMIT } from "../constants";
import { type GlyphRecord, type IconIndex, useIconData } from "./useIconData";

type IconEntry = {
	id: string;
	packLabel: string;
	displayName: string;
	char: string;
	code: string;
	hexCode: string;
	htmlEntity: string;
	nerdFontId: string;
	keywords: string[];
	markdown: string;
	iconPath: string;
};

const iconCache = new Map<string, IconEntry>();

function createIconDataURL(char: string, _code: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><text x="128" y="180" font-family="JetBrainsMono Nerd Font Mono,Symbols Nerd Font Mono,monospace" font-size="160" text-anchor="middle" fill="black" font-weight="normal">${char}</text></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function splitNameIntoWords(value: string): string[] {
	if (!value) return [];
	return value
		.split(/[_-]/g)
		.map((part) => part.trim())
		.filter(Boolean);
}

function createIconEntry(
	id: string,
	glyph: { char: string; code: string },
	displayName: string,
	packLabel: string,
): IconEntry {
	const [pack, ...rest] = id.split("-");
	const rawName = rest.join("-");
	const words = splitNameIntoWords(rawName);

	const codeUpper = glyph.code.toUpperCase();
	const nerdFontId = `nf-${id.replace(/_/g, "-")}`;
	const htmlEntity = `&#x${glyph.code};`;
	const iconPath = createIconDataURL(glyph.char, glyph.code);
	const keywordSet = new Set<string>();

	keywordSet.add(id.toLowerCase());
	keywordSet.add(id.replace(/_/g, " ").toLowerCase());
	keywordSet.add(nerdFontId.toLowerCase());
	keywordSet.add(nerdFontId.replace(/-/g, " "));
	keywordSet.add(pack.toLowerCase());
	keywordSet.add(packLabel.toLowerCase());
	packLabel
		.toLowerCase()
		.split(/\s+/)
		.forEach((token) => {
			if (token) keywordSet.add(token);
		});
	keywordSet.add(glyph.code.toLowerCase());
	keywordSet.add(codeUpper);
	keywordSet.add(`0x${glyph.code.toLowerCase()}`);
	keywordSet.add(`0x${codeUpper}`);
	keywordSet.add(`\\u${codeUpper}`);
	keywordSet.add(htmlEntity.toLowerCase());
	keywordSet.add(htmlEntity);
	keywordSet.add(displayName.toLowerCase());

	words.forEach((word) => {
		const normalized = word.toLowerCase();
		keywordSet.add(normalized);

		if (normalized.includes("+")) {
			keywordSet.add(normalized.replace("+", "plus"));
			keywordSet.add("+");
		}
		if (normalized.includes("-")) {
			keywordSet.add(normalized.replace("-", " "));
		}
	});

	const markdown = [
		`# ${glyph.char} ${displayName}`,
		"",
		`- **Nerd Font name:** \`${nerdFontId}\``,
		`- **Codepoint:** \`${codeUpper}\``,
		`- **HTML entity:** \`${htmlEntity}\``,
	].join("\n");

	return {
		id,
		packLabel,
		displayName,
		char: glyph.char,
		code: glyph.code,
		hexCode: `0x${codeUpper}`,
		htmlEntity,
		nerdFontId,
		keywords: Array.from(keywordSet),
		markdown,
		iconPath,
	};
}

function getIconEntry(index: IconIndex, glyphnames: GlyphRecord): IconEntry {
	const cached = iconCache.get(index.id);
	if (cached) {
		return cached;
	}

	const glyph = glyphnames[index.id];
	const entry = createIconEntry(
		index.id,
		glyph,
		index.displayName,
		index.packLabel,
	);

	iconCache.set(index.id, entry);
	return entry;
}

function loadIconEntries(
	filteredIndex: IconIndex[],
	glyphnames: GlyphRecord,
): IconEntry[] {
	return filteredIndex.map((idx) => getIconEntry(idx, glyphnames));
}

export function useIconSearch(
	searchText: string,
	selectedPack: string,
) {
	const shouldLoadData = searchText.length >= 3;
	const {
		iconIndex,
		glyphnames,
		isLoading: dataLoading,
		fuseInstance,
	} = useIconData(shouldLoadData);

	// Sync filtering with Fuse
	const filteredIndex = useMemo(() => {
		if (searchText.length < 3 || iconIndex.length === 0 || !fuseInstance) {
			return [];
		}

		let searchResults = fuseInstance.search(searchText);

		if (selectedPack !== PACK_FILTER_ALL) {
			searchResults = searchResults.filter(
				(result) => result.item.pack === selectedPack,
			);
		}

		// Add stable secondary sort by ID for items with same score
		// This ensures consistent ordering when scores are identical
		searchResults.sort((a, b) => {
			const scoreDiff = (a.score || 0) - (b.score || 0);
			if (Math.abs(scoreDiff) < 0.000001) {
				// Scores are essentially equal, sort by ID for stability
				return a.item.id.localeCompare(b.item.id);
			}
			return scoreDiff;
		});

		return searchResults
			.slice(0, SEARCH_RESULT_LIMIT)
			.map((result) => result.item);
	}, [iconIndex, selectedPack, searchText, fuseInstance]);

	// Create a stable key from filteredIndex to ensure cache correctness
	const filteredIndexKey = useMemo(() => {
		return filteredIndex.map((item) => item.id).join(",");
	}, [filteredIndex]);

	// Async loading of full icon entries
	const { data: icons = [], isLoading: entriesLoading } = useQuery({
		queryKey: ["iconEntries", filteredIndexKey],
		queryFn: () => {
			if (!glyphnames) throw new Error("Glyphnames not loaded");
			return loadIconEntries(filteredIndex, glyphnames);
		},
		enabled: filteredIndex.length > 0 && glyphnames !== null,
		placeholderData: keepPreviousData,
	});

	return {
		icons,
		isLoading: dataLoading || entriesLoading,
	};
}

export type { IconEntry };
