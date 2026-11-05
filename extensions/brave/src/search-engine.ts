import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataDirForVariant, getBraveProfiles, openSqliteDb, type BraveVariant } from "./utils";

export type SearchEngine = {
	name: string;
	searchUrl: string;
	suggestionsUrl?: string;
};

export const FALLBACK_SEARCH_ENGINE: SearchEngine = {
	name: "Brave Search",
	searchUrl: "https://search.brave.com/search?q={searchTerms}",
	suggestionsUrl: "https://search.brave.com/api/suggest?q={searchTerms}",
};

function readJson(filePath: string): unknown {
	try {
		return JSON.parse(readFileSync(filePath, "utf-8"));
	} catch {
		return undefined;
	}
}

export async function getSearchEngine(variant: BraveVariant): Promise<SearchEngine> {
	const { profiles } = getBraveProfiles(variant);
	const dataDir = dataDirForVariant(variant);

	for (const profile of profiles) {
		const prefs = readJson(path.join(dataDir, profile.path, "Preferences")) as
			| { default_search_provider_data?: { template_url_data?: Record<string, unknown> } }
			| undefined;

		const template = prefs?.default_search_provider_data?.template_url_data;
		const url = typeof template?.url === "string" ? template.url : "";
		if (url.includes("{searchTerms}")) {
			return {
				name: typeof template?.short_name === "string" ? template.short_name : "Brave Search",
				searchUrl: url,
				suggestionsUrl: typeof template?.suggest_url === "string" ? template.suggest_url : undefined,
			};
		}
	}

	for (const profile of profiles) {
		const webDataPath = path.join(dataDir, profile.path, "Web Data");
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
					name: row.short_name || "Brave Search",
					searchUrl: row.url,
					suggestionsUrl: row.suggest_url || undefined,
				};
			}
			stmt.free();
			db.close();
		} catch {
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
		}
	}

	return [];
}