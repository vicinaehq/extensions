import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { HELIUM_DATA_DIR, getHeliumProfiles, openSqliteDb } from "./utils";

export type SearchEngine = {
	name: string;
	searchUrl: string;
	suggestionsUrl?: string;
};

export const FALLBACK_SEARCH_ENGINE: SearchEngine = {
	name: "DuckDuckGo",
	searchUrl: "https://duckduckgo.com/?q={searchTerms}",
	suggestionsUrl: "https://duckduckgo.com/ac/?q={searchTerms}&type=list",
};

function readJson(filePath: string): unknown {
	try {
		return JSON.parse(readFileSync(filePath, "utf-8"));
	} catch {
		return undefined;
	}
}

/**
 * Read Helium's default search engine from the profile's Preferences file
 * (`default_search_provider_data.template_url_data`), falling back to the
 * `keywords` table in the `Web Data` database, then DuckDuckGo.
 */
export async function getSearchEngine(): Promise<SearchEngine> {
	const { profiles } = getHeliumProfiles();

	for (const profile of profiles) {
		const prefs = readJson(path.join(HELIUM_DATA_DIR, profile.path, "Preferences")) as
			| { default_search_provider_data?: { template_url_data?: Record<string, unknown> } }
			| undefined;

		const template = prefs?.default_search_provider_data?.template_url_data;
		const url = typeof template?.url === "string" ? template.url : "";
		if (url.includes("{searchTerms}")) {
			return {
				name: typeof template?.short_name === "string" ? template.short_name : "Helium Search",
				searchUrl: url,
				suggestionsUrl: typeof template?.suggest_url === "string" ? template.suggest_url : undefined,
			};
		}
	}

	for (const profile of profiles) {
		const webDataPath = path.join(HELIUM_DATA_DIR, profile.path, "Web Data");
		if (!existsSync(webDataPath)) continue;

		try {
			const db = await openSqliteDb(webDataPath);
			const stmt = db.prepare(
				"SELECT short_name, url, suggest_url FROM keywords WHERE url LIKE 'http%' AND url LIKE '%{searchTerms}%' AND keyword NOT LIKE '@%' ORDER BY date_created DESC LIMIT 1",
			);
			if (stmt.step()) {
				const row = stmt.getAsObject() as Record<string, string>;
				stmt.free();
				db.close();
				return {
					name: row.short_name || "Helium Search",
					searchUrl: row.url,
					suggestionsUrl: row.suggest_url || undefined,
				};
			}
			stmt.free();
			db.close();
		} catch {
			// Web Data locked or unreadable; try next profile
		}
	}

	return FALLBACK_SEARCH_ENGINE;
}

export function buildSearchUrl(templateUrl: string, query: string): string {
	if (templateUrl.includes("{searchTerms}")) {
		return templateUrl.replace(/\{searchTerms\}/g, encodeURIComponent(query));
	}
	return `${templateUrl}${encodeURIComponent(query)}`;
}

/**
 * Parse OpenSearch-style suggestion responses. Google returns
 * `["query", ["s1", "s2", ...]]`, DuckDuckGo returns `[{"phrase": "s1"}, ...]`.
 */
export function parseSuggestions(json: unknown): string[] {
	if (Array.isArray(json) && json.length >= 2 && Array.isArray(json[1])) {
		return (json[1] as unknown[]).filter((item): item is string => typeof item === "string");
	}
	if (Array.isArray(json)) {
		return json
			.map((item) => (item && typeof item === "object" && "phrase" in item ? item.phrase : undefined))
			.filter((phrase): phrase is string => typeof phrase === "string");
	}
	return [];
}

/**
 * Fetch suggestions for the engine. Engines without a suggestion URL (or with
 * an unreachable one) fall back to Google's OpenSearch endpoint, which accepts
 * any query and is the most reliable public source.
 */
export async function fetchSuggestions(engine: SearchEngine, query: string): Promise<string[]> {
	const candidates = [
		engine.suggestionsUrl ? buildSearchUrl(engine.suggestionsUrl, query) : undefined,
		buildSearchUrl("https://www.google.com/complete/search?client=chrome&q={searchTerms}", query),
	].filter((url): url is string => Boolean(url));

	for (const url of candidates) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
			if (!response.ok) continue;
			const suggestions = parseSuggestions(await response.json());
			if (suggestions.length > 0) return suggestions;
		} catch {
			// try the next candidate
		}
	}

	return [];
}
