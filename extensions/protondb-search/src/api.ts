import { QueryCache, QueryClient } from "@tanstack/react-query";
import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core";
import type {
	PersistedClient,
	Persister,
} from "@tanstack/react-query-persist-client";
import { Cache, showToast, Toast } from "@vicinae/api";
import ms from "ms";
import {
	SteamAppDetailsSchema,
} from "./types";
import type {
	ProtonDBRating,
	SteamAppDetails,
	SteamAppDetailsResponse,
	SteamFeaturedCategories,
	SteamFeaturedItem,
	SteamGame,
} from "./types";

const STEAM_SEARCH_URL = "https://steamcommunity.com/actions/SearchApps";
const PROTONDB_RATING_URL = "https://www.protondb.com/api/v1/reports/summaries";
const STEAM_APPDETAILS_URL =
	"https://www.protondb.com/proxy/steam/api/appdetails";
const STEAM_FEATURED_URL =
	"https://store.steampowered.com/api/featuredcategories";

const QUERY_ERROR_MESSAGES = new Map<string, string>([
	[["featured-games"].join("::"), "Could not load featured games from Steam"],
	[["steam-search"].join("::"), "Could not search Steam right now"],
	[["game-details"].join("::"), "Could not load information from Steam"],
	[["protondb-rating"].join("::"), "Could not load ProtonDB compatibility data"],
]);

const FALLBACK_GAME_IDS = [
	570,
	730,
	1172470,
	1091500,
	1086940,
	1938090,
	813780,
	1623730,
	2358720,
	271590,
];

export const SEARCH_DEBOUNCE_MS = 500;
export const REQUEST_TIMEOUT_MS = ms("10s");
export const PERSIST_MAX_AGE = ms("12h");
export const QUERY_STALE_TIME = PERSIST_MAX_AGE;

const cache = new Cache();
const PERSIST_KEY = "protondb-query-v1";

const IMAGE_CACHE_CAPACITY = 5 * 1024 * 1024; // 5 MB
const imageCache = new Cache({ capacity: IMAGE_CACHE_CAPACITY, ttl: PERSIST_MAX_AGE });

export const imagePersister = experimental_createQueryPersister({
	storage: {
		getItem: (key) => imageCache.get(key) ?? null,
		setItem: (key, value) => imageCache.set(key, value),
		removeItem: (key) => { imageCache.remove(key); },
	},
	maxAge: PERSIST_MAX_AGE,
}).persisterFn;

function getQueryErrorMessage(queryKey: ReadonlyArray<unknown>): string {
	const scope = typeof queryKey[0] === "string" ? queryKey[0] : "";
	return QUERY_ERROR_MESSAGES.get(scope) || "Request failed";
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
	let response: Response;

	try {
		response = await fetch(url, {
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
				: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		if (isAbortError(error)) {
			throw new Error("Request timed out or was cancelled");
		}

		throw error;
	}

	if (response.ok === false) {
		throw new Error(`Request failed: ${response.status} ${response.statusText}`);
	}

	return (await response.json()) as T;
}

export async function fetchImageAsDataUri(url: string): Promise<string> {
	const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
	if (response.ok === false) {
		throw new Error(`Image fetch failed: ${response.status}`);
	}
	const buffer = await response.arrayBuffer();
	const contentType = response.headers.get("content-type") ?? "image/jpeg";
	const base64 = Buffer.from(buffer).toString("base64");
	return `data:${contentType};base64,${base64}`;
}

export const persister = {
	persistClient: async (client: PersistedClient) => {
		cache.set(PERSIST_KEY, JSON.stringify(client));
	},
	restoreClient: async () => {
		const cached = cache.get(PERSIST_KEY);
		if (!cached) return undefined;

		try {
			return JSON.parse(cached) as PersistedClient;
		} catch {
			cache.remove(PERSIST_KEY);
			return undefined;
		}
	},
	removeClient: async () => {
		cache.remove(PERSIST_KEY);
	},
} satisfies Persister;

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			showToast({
				style: Toast.Style.Failure,
				title: "Request failed",
				message:
					error instanceof Error
						? `${getQueryErrorMessage(query.queryKey)}: ${error.message}`
						: getQueryErrorMessage(query.queryKey),
			});
		},
	}),
	defaultOptions: {
		queries: {
			staleTime: QUERY_STALE_TIME,
			gcTime: PERSIST_MAX_AGE,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

export async function searchSteamGames(query: string, signal?: AbortSignal): Promise<SteamGame[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const games = await fetchJson<SteamGame[]>(
		`${STEAM_SEARCH_URL}/${encodeURIComponent(trimmed)}`,
		signal,
	);
	return games.slice(0, 20);
}

async function fetchGamesByIds(appIds: number[]): Promise<SteamGame[]> {
	const gameDetails = await Promise.all(
		appIds.map(async (appId) => {
			try {
				const detailsData = await fetchJson<SteamAppDetailsResponse>(
					`${STEAM_APPDETAILS_URL}?appids=${appId}`,
				);
				const gameData = detailsData[appId];

				if (
					gameData?.success &&
					gameData.data &&
					gameData.data.type === "game"
				) {
					return {
						appid: String(appId),
						name: gameData.data.name,
						logo:
							gameData.data.capsule_imagev5 || gameData.data.header_image || "",
					};
				}

				return null;
			} catch {
				return null;
			}
		}),
	);

	const validGames = gameDetails.filter(
		(game): game is { appid: string; name: string; logo: string } =>
			game !== null,
	);

	const icons = await Promise.all(
		validGames.map(async (game) => {
			try {
				const searchResults = await fetchJson<SteamGame[]>(
					`${STEAM_SEARCH_URL}/${encodeURIComponent(game.name)}`,
				);
				const matchingGame = searchResults.find((item) => item.appid === game.appid);
				return { appid: game.appid, icon: matchingGame?.icon || "" };
			} catch {
				return { appid: game.appid, icon: "" };
			}
		}),
	);

	const iconMap = new Map(icons.map((icon) => [icon.appid, icon.icon]));

	return validGames.map((game) => ({
		...game,
		icon: iconMap.get(game.appid) || "",
	}));
}

export async function fetchFeaturedGames(): Promise<SteamGame[]> {
	try {
		const data = await fetchJson<SteamFeaturedCategories>(STEAM_FEATURED_URL);
		const topSellers = data.top_sellers?.items || [];
		const specials = data.specials?.items || [];
		const seenAppIds = new Set<number>();
		const STEAM_DECK_APP_ID = 1675200;
		const allItems = [...topSellers, ...specials];

		const appIds = allItems
			.map((item: SteamFeaturedItem) => item.id)
			.filter((id: number) => {
				if (!id || id === STEAM_DECK_APP_ID || seenAppIds.has(id)) return false;
				seenAppIds.add(id);
				return true;
			})
			.slice(0, 10);

		return await fetchGamesByIds(appIds);
	} catch {
		showToast({
			style: Toast.Style.Failure,
			title: "Using fallback games",
			message: "Could not load featured games from Steam",
		});

		return fetchGamesByIds(FALLBACK_GAME_IDS);
	}
}

export async function fetchProtonDBRating(
	appId: string,
): Promise<ProtonDBRating | null> {
	try {
		return await fetchJson<ProtonDBRating>(`${PROTONDB_RATING_URL}/${appId}.json`);
	} catch (error) {
		if (error instanceof Error && error.message.includes("404")) {
			return null;
		}

		throw error;
	}
}

export async function fetchGameDetails(
	appId: string,
): Promise<SteamAppDetails | null> {
	const data = await fetchJson<SteamAppDetailsResponse>(
		`${STEAM_APPDETAILS_URL}?appids=${appId}`,
	);
	const gameData = data[appId];

	if (gameData?.success && gameData.data) {
		return SteamAppDetailsSchema.parse(gameData.data);
	}

	return null;
}
