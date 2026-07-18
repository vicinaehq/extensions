import type {
	Genre,
	LoginType,
	MediaDetails,
	MediaResult,
	TrendingResponse,
} from "./types";

const FETCH_TIMEOUT = 15_000;

function normalizeUrl(url: string): string {
	return url.replace(/\/+$/, "");
}

async function fetchWithTimeout(
	url: string,
	init?: RequestInit,
	timeout = FETCH_TIMEOUT,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

function extractCookie(response: Response): string {
	const setCookie = response.headers.get("set-cookie");
	if (!setCookie) {
		throw new Error("Authentication failed: No session cookie received");
	}
	const match = setCookie.match(/connect\.sid=[^;]+/);
	if (!match) {
		throw new Error("Authentication failed: Invalid session cookie");
	}
	return match[0];
}

export async function authLocal(
	serverUrl: string,
	email: string,
	password: string,
): Promise<string> {
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/auth/local`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Local login failed (${response.status}): Please check your email and password`,
		);
	}
	return extractCookie(response);
}

export async function authJellyfin(
	serverUrl: string,
	username: string,
	password: string,
): Promise<string> {
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/auth/jellyfin`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password }),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Jellyfin login failed (${response.status}): Check your credentials and server URL`,
		);
	}
	return extractCookie(response);
}

export async function authenticate(
	serverUrl: string,
	loginType: LoginType,
	username: string,
	password: string,
): Promise<string> {
	return loginType === "local"
		? authLocal(serverUrl, username, password)
		: authJellyfin(serverUrl, username, password);
}

export async function fetchTrending(
	serverUrl: string,
	cookie: string,
	page = 1,
	mediaType?: "movie" | "tv",
): Promise<TrendingResponse> {
	const params = new URLSearchParams({ page: String(page) });
	if (mediaType) params.set("mediaType", mediaType);
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/discover/trending?${params}`,
		{ headers: { Cookie: cookie } },
	);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch trending (${response.status}): Check your server URL and connection`,
		);
	}
	return (await response.json()) as TrendingResponse;
}

export async function searchMedia(
	serverUrl: string,
	cookie: string,
	query: string,
	page = 1,
): Promise<TrendingResponse> {
	const params = new URLSearchParams({
		query,
		page: String(page),
	});
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/search?${params}`,
		{ headers: { Cookie: cookie } },
	);
	if (!response.ok) {
		throw new Error(
			`Search failed (${response.status}): Check your server URL and connection`,
		);
	}
	return (await response.json()) as TrendingResponse;
}

export async function fetchMediaDetails(
	serverUrl: string,
	cookie: string,
	mediaType: "movie" | "tv",
	mediaId: number,
): Promise<MediaDetails> {
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/${mediaType}/${mediaId}`,
		{ headers: { Cookie: cookie } },
	);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch details (${response.status}): ${response.statusText}`,
		);
	}
	return (await response.json()) as MediaDetails;
}

export async function requestMedia(
	serverUrl: string,
	cookie: string,
	mediaType: "movie" | "tv",
	mediaId: number,
	seasons?: number[],
): Promise<void> {
	const body: Record<string, unknown> = { mediaType, mediaId };
	if (seasons) body.seasons = seasons;
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/request`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookie,
			},
			body: JSON.stringify(body),
		},
	);
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to request media: ${text || response.statusText}`);
	}
}

export async function fetchGenres(
	serverUrl: string,
	cookie: string,
	mediaType: "movie" | "tv",
): Promise<Genre[]> {
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/genres/${mediaType}`,
		{ headers: { Cookie: cookie } },
	);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch genres (${response.status}): ${response.statusText}`,
		);
	}
	return (await response.json()) as Genre[];
}

export async function fetchByGenre(
	serverUrl: string,
	cookie: string,
	mediaType: "movie" | "tv",
	genreId: number,
	page = 1,
): Promise<TrendingResponse> {
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/discover/${mediaType}/genre/${genreId}?page=${page}`,
		{ headers: { Cookie: cookie } },
	);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch by genre (${response.status}): ${response.statusText}`,
		);
	}
	return (await response.json()) as TrendingResponse;
}

export async function fetchRecommendations(
	serverUrl: string,
	cookie: string,
	mediaType: "movie" | "tv",
	mediaId: number,
): Promise<MediaResult[]> {
	const response = await fetchWithTimeout(
		`${normalizeUrl(serverUrl)}/api/v1/${mediaType}/${mediaId}/recommendations`,
		{ headers: { Cookie: cookie } },
	);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch recommendations (${response.status}): ${response.statusText}`,
		);
	}
	const data = (await response.json()) as TrendingResponse;
	return data.results.filter(
		(item) => item.mediaType === "movie" || item.mediaType === "tv",
	);
}
