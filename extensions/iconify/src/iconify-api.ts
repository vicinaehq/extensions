import { Cache } from "@vicinae/api";
import type {
	IconData,
	IconResponse,
	IconSearchResponse,
	IconSet,
	IconSetResponse,
} from "./iconify-types";

const JSDELIVR_BASE_URL = "https://cdn.jsdelivr.net";
const ICONIFY_BASE_URL = "https://api.iconify.design";
const ONE_DAY = 1000 * 60 * 60 * 24;
const cache = new Cache({ namespace: "iconify", ttl: ONE_DAY });

const createURL = (
	baseURL: string,
	pathname: string,
	params?: Record<string, string>,
) => {
	const url = new URL(pathname, baseURL);
	if (params) {
		url.search = new URLSearchParams(params).toString();
	}
	return url.toString();
};

const fetchJson = async <T>(url: string, signal?: AbortSignal): Promise<T> => {
	const response = await fetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	return (await response.json()) as T;
};

const readCache = <T>(key: string) => {
	const cached = cache.get(key);
	if (!cached) {
		return undefined;
	}
	return JSON.parse(cached) as T;
};

const writeCache = (key: string, value: unknown) => {
	cache.set(key, JSON.stringify(value));
};

export const clearIconifyCache = () => {
	cache.clear();
};

export const listSets = async (signal?: AbortSignal): Promise<IconSet[]> => {
	const cached = readCache<IconSet[]>("sets");
	if (cached) {
		return cached;
	}

	const url = createURL(
		JSDELIVR_BASE_URL,
		"/gh/iconify/icon-sets/collections.json",
	);
	const collections = await fetchJson<Record<string, IconSetResponse>>(
		url,
		signal,
	);
	const sets = Object.entries(collections)
		.filter(([, set]) => !set.hidden)
		.map(([id, set]) => ({
			id,
			name: set.name,
			category: set.category ?? "Other",
		}))
		.sort((left, right) => left.name.localeCompare(right.name));

	writeCache("sets", sets);
	return sets;
};

export const listIcons = async (
	set: IconSet,
	signal?: AbortSignal,
): Promise<IconData[]> => {
	const cacheKey = `set:${set.id}`;
	const cached = readCache<IconData[]>(cacheKey);
	if (cached) {
		return cached;
	}

	const url = createURL(
		JSDELIVR_BASE_URL,
		`/gh/iconify/icon-sets/json/${set.id}.json`,
	);
	const data = await fetchJson<IconResponse>(url, signal);
	const icons = Object.entries(data.icons)
		.map(([id, icon]) => ({
			set: { id: set.id, title: set.name },
			id,
			width: data.width,
			height: data.height,
			body: icon.body,
		}))
		.sort((left, right) => left.id.localeCompare(right.id));

	writeCache(cacheKey, icons);
	return icons;
};

const getIcons = async (
	setId: string,
	setTitle: string,
	ids: string[],
	signal?: AbortSignal,
): Promise<IconData[]> => {
	if (ids.length === 0) {
		return [];
	}

	const url = createURL(ICONIFY_BASE_URL, `/${setId}.json`, {
		icons: ids.join(","),
	});
	const data = await fetchJson<IconResponse>(url, signal);
	return ids
		.filter((id) => data.icons[id] !== undefined)
		.map((id) => ({
			set: { id: setId, title: setTitle },
			id,
			width: data.width,
			height: data.height,
			body: data.icons[id].body,
		}));
};

export const searchIcons = async (
	query: string,
	signal?: AbortSignal,
): Promise<IconData[]> => {
	if (!query.trim()) {
		return [];
	}

	const url = createURL(ICONIFY_BASE_URL, "/search", {
		query,
		limit: "100",
	});
	const result = await fetchJson<IconSearchResponse>(url, signal);
	const grouped = new Map<string, { title: string; ids: string[] }>();

	for (const icon of result.icons) {
		const [setId, iconId] = icon.split(":");
		if (!setId || !iconId) {
			continue;
		}

		const collection = result.collections[setId];
		if (!collection) {
			continue;
		}

		const entry = grouped.get(setId) ?? { title: collection.name, ids: [] };
		entry.ids.push(iconId);
		grouped.set(setId, entry);
	}

	const icons = await Promise.all(
		Array.from(grouped.entries()).map(([setId, entry]) =>
			getIcons(setId, entry.title, entry.ids, signal),
		),
	);

	return icons.flat();
};
