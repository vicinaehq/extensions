import { Action, ActionPanel, Icon, List, closeMainWindow, open } from "@vicinae/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildSearchUrl, fetchSuggestions, getSearchEngine, type SearchEngine } from "./search-engine";
import { getFavicon } from "./utils";

type Suggestion = {
	id: string;
	query: string;
	url: string;
	type: "search" | "url";
};

function isURL(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed || trimmed.includes(" ")) return false;
	return /^(?:https?|ftp):\/\/\S+$/i.test(trimmed) || /^(?:\w+\.)+\w{2,}(?:[/?#]\S*)?$/.test(trimmed);
}

function normalizeURL(url: string): string {
	const trimmed = url.trim();
	return /^\S+?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function Command() {
	const [searchText, setSearchText] = useState("");
	const [engine, setEngine] = useState<SearchEngine | null>(null);
	const [engineError, setEngineError] = useState<string | null>(null);
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		void getSearchEngine().then(setEngine).catch((e) => setEngineError(e instanceof Error ? e.message : String(e)));
	}, []);

	useEffect(() => {
		abortRef.current?.abort();
		const query = searchText.trim();
		if (!query || !engine) {
			setSuggestions([]);
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;
		void fetchSuggestions(engine, query).then((results) => {
			if (!controller.signal.aborted) setSuggestions(results);
		});

		return () => controller.abort();
	}, [searchText, engine]);

	const items = useMemo<Suggestion[]>(() => {
		const query = searchText.trim();
		if (!query || !engine) return [];

		const results: Suggestion[] = [];
		if (isURL(query)) {
			results.push({ id: "url", query, url: normalizeURL(query), type: "url" });
		}
		results.push({
			id: "search",
			query,
			url: buildSearchUrl(engine.searchUrl, query),
			type: "search",
		});
		suggestions
			.filter((s) => s.toLowerCase() !== query.toLowerCase())
			.slice(0, 8)
			.forEach((s, index) => {
				results.push({ id: `suggestion-${index}`, query: s, url: buildSearchUrl(engine.searchUrl, s), type: "search" });
			});
		return results;
	}, [searchText, engine, suggestions]);

	const engineName = engine?.name ?? "Helium Search";

	return (
		<List
			isLoading={!engine && !engineError}
			searchText={searchText}
			onSearchTextChange={setSearchText}
			searchBarPlaceholder={`Search the web with ${engineName}`}
			throttle
		>
			{engineError ? (
				<List.EmptyView title="Could not determine Helium's search engine" description={engineError} icon={Icon.Exclamationmark} />
			) : (
				<>
					{items.map((item) => (
						<List.Item
							key={item.id}
							icon={item.type === "url" ? getFavicon(item.url, Icon.Link) : Icon.MagnifyingGlass}
							title={item.type === "url" ? `Open ${item.query}` : item.query}
							subtitle={item.type === "url" ? "Open URL" : `Search with ${engineName}`}
							actions={
								<ActionPanel>
									<Action
										title={item.type === "url" ? "Open URL" : "Search"}
										icon={item.type === "url" ? Icon.Link : Icon.MagnifyingGlass}
										onAction={async () => {
											await closeMainWindow();
											await open(item.url, "helium");
										}}
									/>
									<Action.CopyToClipboard title="Copy URL" content={item.url} />
									<Action.CopyToClipboard title="Copy Query" content={item.query} />
								</ActionPanel>
							}
						/>
					))}
					<List.EmptyView
						title="Start typing to search"
						description={`Search with ${engineName}, Helium's default search engine`}
						icon={Icon.MagnifyingGlass}
					/>
				</>
			)}
		</List>
	);
}
