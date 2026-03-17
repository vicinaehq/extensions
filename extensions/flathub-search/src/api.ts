import { execSync } from "node:child_process";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type {
	PersistedClient,
	Persister,
} from "@tanstack/react-query-persist-client";
import { Cache, showToast, Toast } from "@vicinae/api";
import ms from "ms";

export type FlathubApp = {
	app_id: string;
	name: string;
	summary: string;
	icon?: string;
	project_license?: string;
	installs_last_month?: number;
	trending?: number;
	favorites_count?: number;
	description?: string;
	developer_name?: string;
	screenshots?: Array<{
		caption?: string;
		default?: boolean;
		sizes: Array<{
			src: string;
			width: string;
			height: string;
			scale?: string;
		}>;
	}>;
	releases?: Array<{
		version: string;
		timestamp: number;
		description?: string;
	}>;
};

export function hasFlatpakHandler(): boolean {
	try {
		const result = execSync(
			"xdg-mime query default x-scheme-handler/flatpak+https",
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			},
		).trim();
		return result.length > 0;
	} catch {
		return false;
	}
}

const FLATHUB_SEARCH_URL = "https://flathub.org/api/v2/search";
const FLATHUB_APP_DETAIL_URL = "https://flathub.org/api/v2/appstream";
const PERSIST_KEY = "flathub-query-v1";

export const PERSIST_MAX_AGE = ms("24h");
const POPULAR_LIMIT = 20;

const cache = new Cache();

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
			console.error("[flathub-search] query error", query.queryKey, error);
			showToast({
				style: Toast.Style.Failure,
				title: "Search failed",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		},
	}),
	defaultOptions: {
		queries: {
			// staleTime is intentionally shorter than PERSIST_MAX_AGE: persisted data
			// is shown immediately on open, but a background refetch runs after 5 min
			// to keep results fresh without blocking the UI.
			staleTime: ms("5m"),
			gcTime: PERSIST_MAX_AGE,
			retry: 1,
		},
	},
});

// Unified POST helper
async function postFlathubSearch(query: string): Promise<FlathubApp[]> {
	const response = await fetch(FLATHUB_SEARCH_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query: query.trim() }),
	});
	if (!response.ok) {
		throw new Error(
			`Flathub request failed: ${response.status} ${response.statusText}`,
		);
	}
	const data = (await response.json()) as { hits: FlathubApp[] };
	return data.hits || [];
}

export async function searchFlathub(query: string): Promise<FlathubApp[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	const results = await postFlathubSearch(trimmed);
	// Sort by installs descending for relevance
	return results.sort(
		(a, b) => (b.installs_last_month || 0) - (a.installs_last_month || 0),
	);
}

export async function fetchPopularApps(): Promise<FlathubApp[]> {
	// Empty query returns overall list; we slice top POPULAR_LIMIT
	const apps = await postFlathubSearch("");
	return apps.slice(0, POPULAR_LIMIT);
}

export async function fetchAppDetails(appId: string): Promise<FlathubApp> {
	const response = await fetch(`${FLATHUB_APP_DETAIL_URL}/${appId}`, {
		signal: AbortSignal.timeout(ms("10s")),
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch app details: ${response.status}`);
	}
	const data = await response.json();
	return data;
}
