import { Cache } from "@vicinae/api";
import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import fuseOptions from "./fuse-options.json";
import searchConfig from "./search-config.json";
import {
	parseIconIndexFile,
	type IconIndex,
	type SerializedIconIndex,
} from "./schemas/icon-data";

let fuseInstance: Fuse<IconIndex> | null = null;
let cachedIconIndex: IconIndex[] | null = null;
let iconIndexLoadPromise: Promise<IconIndex[]> | null = null;
const cache = new Cache();

const NERD_FONTS_VERSION = "3.4.0";
const GLYPHNAMES_URL = `https://raw.githubusercontent.com/ryanoasis/nerd-fonts/v${NERD_FONTS_VERSION}/glyphnames.json`;
const ICON_INDEX_CACHE_KEY = `nerdfont-search.icon-index.${NERD_FONTS_VERSION}.v1`;

const ACRONYMS = new Set(searchConfig.acronyms);
const TOKEN_SYNONYMS = searchConfig.tokenSynonyms as Record<string, string[]>;
const PACK_LABELS = searchConfig.packLabels as Record<string, string>;

const FUSE_OPTIONS: IFuseOptions<IconIndex> = fuseOptions;

function addSynonyms(token: string): string[] {
	const synonyms = TOKEN_SYNONYMS[token] || [];
	const extras: string[] = [];

	if (token === "plus") {
		extras.push("+", "add");
	}
	if (token === "minus") {
		extras.push("-", "subtract");
	}
	if (token === "times") {
		extras.push("x");
	}
	if (token === "close") {
		extras.push("quit");
	}

	return [...synonyms, ...extras].map((entry) => entry.toLowerCase());
}

function splitNameIntoWords(value: string): string[] {
	if (!value) {
		return [];
	}

	return value
		.split(/[_-]/g)
		.map((part) => part.trim())
		.filter(Boolean);
}

function simpleTitleCase(word: string): string {
	const lower = word.toLowerCase();

	if (ACRONYMS.has(lower)) {
		return lower.toUpperCase();
	}

	if (/^\d+$/.test(word)) {
		return word;
	}

	if (word.length <= 2) {
		return word.toUpperCase();
	}

	return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildSearchTokens({
	id,
	pack,
	packLabel,
	displayName,
	rawName,
	words,
}: {
	id: string;
	pack: string;
	packLabel: string;
	displayName: string;
	rawName: string;
	words: string[];
}) {
	const searchTokens = new Set<string>();
	searchTokens.add(id.toLowerCase());
	searchTokens.add(pack.toLowerCase());
	searchTokens.add(packLabel.toLowerCase());
	searchTokens.add(displayName.toLowerCase());
	searchTokens.add(rawName.toLowerCase().replace(/_/g, " "));

	for (const word of words) {
		const normalized = word.toLowerCase();
		searchTokens.add(normalized);
		for (const synonym of addSynonyms(normalized)) {
			searchTokens.add(synonym);
		}
	}

	return Array.from(searchTokens);
}

function buildSerializedIconIndex(glyphnames: Record<string, { char: string; code: string }>) {
	const tokenSet = new Set<string>();
	const entries: Array<SerializedIconIndex & { rawTokens: string[] }> = [];

	for (const [id, glyph] of Object.entries(glyphnames)) {
		const [pack, ...rest] = id.split("-");
		const rawName = rest.join("-");
		const words = splitNameIntoWords(rawName);
		const packLabel = PACK_LABELS[pack] || pack.toUpperCase();
		const displayName =
			words.length > 0
				? words.map((word) => simpleTitleCase(word)).join(" ")
				: simpleTitleCase(pack);
		const rawTokens = buildSearchTokens({
			id,
			pack,
			packLabel,
			displayName,
			rawName,
			words,
		});

		for (const token of rawTokens) {
			tokenSet.add(token);
		}

		entries.push({
			id,
			pack,
			char: glyph.char,
			code: glyph.code,
			displayName,
			packLabel,
			rawTokens,
			searchTokens: [],
		});
	}

	const dictionary = Array.from(tokenSet);
	const tokenToIndex = new Map(dictionary.map((token, index) => [token, index]));

	return {
		dictionary,
		icons: entries.map(({ rawTokens, ...icon }) => ({
			...icon,
			searchTokens: rawTokens
				.map((token) => tokenToIndex.get(token))
				.filter((index): index is number => index !== undefined),
		})),
	};
}

async function fetchAndBuildIconIndex() {
	const response = await fetch(GLYPHNAMES_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch glyphnames: ${response.status} ${response.statusText}`);
	}

	const source = (await response.json()) as Record<string, { char: string; code: string }>;
	const glyphnames = Object.fromEntries(
		Object.entries(source).filter(([key]) => key !== "METADATA"),
	) as Record<string, { char: string; code: string }>;

	return buildSerializedIconIndex(glyphnames);
}

async function loadIconIndex(): Promise<IconIndex[]> {
	const cachedRaw = cache.get(ICON_INDEX_CACHE_KEY);
	let data: ReturnType<typeof parseIconIndexFile> | undefined;

	if (cachedRaw) {
		try {
			data = parseIconIndexFile(JSON.parse(cachedRaw));
		} catch {
			cache.remove(ICON_INDEX_CACHE_KEY);
		}
	}

	if (!data) {
		const built = await fetchAndBuildIconIndex();
		cache.set(ICON_INDEX_CACHE_KEY, JSON.stringify(built));
		data = parseIconIndexFile(built);
	}

	const dictionary = data.dictionary;
	const decodedIndex = data.icons.map((icon) => ({
		...icon,
		searchTokens: icon.searchTokens.map((idx) => dictionary[idx]),
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

function getCachedIconIndex() {
	return cachedIconIndex;
}

function getFuseInstance() {
	return fuseInstance;
}

export { ensureIconIndexLoaded, getCachedIconIndex, getFuseInstance };
export type { IconIndex };
