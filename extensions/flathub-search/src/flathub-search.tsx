import { keepPreviousData, QueryClient, useQuery } from "@tanstack/react-query";
import {
	PersistQueryClientProvider,
	type PersistedClient,
	type Persister,
} from "@tanstack/react-query-persist-client";
import {
	Action,
	ActionPanel,
	Cache,
	Clipboard,
	closeMainWindow,
	Icon,
	LaunchProps,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";

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

export type FlathubSearchResponse = {
	hits: FlathubApp[];
};

const FLATHUB_SEARCH_URL = "https://flathub.org/api/v2/search";
const FLATHUB_APP_DETAIL_URL = "https://flathub.org/api/v2/appstream";
const PERSIST_KEY = "flathub-query-v1";
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000; // 24h
const POPULAR_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 500;

const cache = new Cache();

const persister = {
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

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000,
			gcTime: PERSIST_MAX_AGE,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

function formatInstalls(count?: number): string {
	if (!count) return "";
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M installs`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K installs`;
	return `${count} installs`;
}

function useDebounce<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(id);
	}, [value, delay]);
	return debounced;
}

// Unified POST helper
async function postFlathubSearch(query: string): Promise<FlathubApp[]> {
	const response = await fetch(FLATHUB_SEARCH_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query }),
	});
	if (!response.ok) {
		throw new Error(
			`Flathub request failed: ${response.status} ${response.statusText}`,
		);
	}
	const data: FlathubSearchResponse = await response.json();
	return data.hits || [];
}

async function searchFlathub(query: string): Promise<FlathubApp[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	const results = await postFlathubSearch(trimmed);
	// Sort by installs descending for relevance
	return results.sort(
		(a, b) => (b.installs_last_month || 0) - (a.installs_last_month || 0),
	);
}

async function fetchPopularApps(): Promise<FlathubApp[]> {
	// Empty query returns overall list; we slice top POPULAR_LIMIT
	const apps = await postFlathubSearch("");
	const subset = apps.slice(0, POPULAR_LIMIT);
	return subset;
}

async function fetchAppDetails(appId: string): Promise<FlathubApp> {
	const response = await fetch(`${FLATHUB_APP_DETAIL_URL}/${appId}`);
	if (!response.ok) {
		throw new Error(`Failed to fetch app details: ${response.status}`);
	}
	const data = await response.json();
	return data;
}

function AppDetail({ app }: { app: FlathubApp }) {
	const { data: fullApp, isLoading } = useQuery({
		queryKey: ["flathub", "app-detail", app.app_id],
		queryFn: () => fetchAppDetails(app.app_id),
		staleTime: 10 * 60 * 1000,
	});

	const displayApp = fullApp || app;

	const _formatDate = (timestamp?: number) => {
		if (!timestamp) return null;
		const date = new Date(timestamp * 1000);
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	const screenshots = displayApp.screenshots || [];
	const latestRelease = displayApp.releases?.[0];

	// Create markdown with screenshots using HTML img tags and PNG format (not WebP)
	let markdown = "";

	if (isLoading) {
		markdown = "Loading app details...";
	} else if (screenshots.length > 0) {
		// Show up to 3 screenshots - use larger images for better visibility
		markdown = screenshots
			.slice(0, 3)
			.map((screenshot, idx) => {
				// Use larger images (624-752px) for better detail
				// Flathub typically provides: 112px (@1x/@2x), 224px, 624px, 752px, and original
				const largeImg = screenshot.sizes.find((s) => {
					const width = parseInt(s.width, 10);
					return width >= 624 && width <= 752;
				});
				// Fallback to largest available
				const imgUrl =
					largeImg?.src || screenshot.sizes[screenshot.sizes.length - 1]?.src;
				// Convert WebP to PNG (Vicinae doesn't support WebP)
				const pngUrl = imgUrl.replace(/\.webp$/, ".png");
				const caption = screenshot.caption
					? `\n\n<p style="text-align: center;"><em>${screenshot.caption}</em></p>`
					: "";
				// Stack images vertically with separators
				return `<img src="${pngUrl}" alt="Screenshot ${idx + 1}" style="width: 100%; height: auto;" />${caption}`;
			})
			.join("\n\n---\n\n");
	} else {
		// Fallback: Show app icon and description
		markdown = app.icon
			? `<img src="${app.icon}" alt="${app.name}" style="width: 128px; height: auto;" />\n\n## ${displayApp.name}\n\n${displayApp.description || displayApp.summary}`
			: `# ${displayApp.name}\n\n${displayApp.description || displayApp.summary}`;
	}

	return (
		<List.Item.Detail
			isLoading={isLoading}
			markdown={markdown}
			metadata={
				<List.Item.Detail.Metadata>
					{displayApp.summary && (
						<List.Item.Detail.Metadata.Label
							title="Tagline"
							text={displayApp.summary}
						/>
					)}
					{displayApp.developer_name && (
						<List.Item.Detail.Metadata.Label
							title="Developer"
							text={displayApp.developer_name}
						/>
					)}
					{displayApp.installs_last_month && (
						<List.Item.Detail.Metadata.Label
							title="Installs"
							text={formatInstalls(displayApp.installs_last_month)}
						/>
					)}
					{latestRelease && (
						<List.Item.Detail.Metadata.Label
							title="Version"
							text={latestRelease.version}
						/>
					)}
				</List.Item.Detail.Metadata>
			}
		/>
	);
}

function FlathubSearchContent({ fallbackText }: { fallbackText?: string }) {
	const [searchText, setSearchText] = useState(fallbackText || "");
	const [showingDetail, setShowingDetail] = useState(false);
	const debouncedSearch = useDebounce(searchText, SEARCH_DEBOUNCE_MS);

	// Popular apps query
	const { data: popularApps = [], isLoading: loadingPopular } = useQuery({
		queryKey: ["flathub", "popular"],
		queryFn: fetchPopularApps,
		staleTime: 10 * 60 * 1000,
	});

	// Search query
	const {
		data: searchResults = [],
		isLoading: loadingSearch,
		isError,
		error,
	} = useQuery({
		queryKey: ["flathub", "search", debouncedSearch],
		queryFn: () => searchFlathub(debouncedSearch),
		enabled: debouncedSearch.trim().length > 0,
		placeholderData: keepPreviousData,
	});

	if (isError && error) {
		showToast({
			style: Toast.Style.Failure,
			title: "Search failed",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}

	const showingSearch = debouncedSearch.trim().length > 0;
	const displayed = showingSearch ? searchResults : popularApps;
	const isLoading = showingSearch ? loadingSearch : loadingPopular;

	return (
		<List
			isLoading={isLoading}
			isShowingDetail={showingDetail}
			searchBarPlaceholder="Search Flathub applications..."
			onSearchTextChange={setSearchText}
			searchText={searchText}
		>
			{displayed.length === 0 && showingSearch && !isLoading ? (
				<List.EmptyView
					title="No applications found"
					description="Try different search terms"
				/>
			) : (
				<>
					{!showingSearch && displayed.length > 0 && (
						<List.Section title="Popular Applications" />
					)}
					{displayed.map((app) => (
						<List.Item
							key={app.app_id}
							title={app.name}
							subtitle={showingDetail ? undefined : app.summary}
							icon={app.icon || Icon.AppWindow}
							accessories={
								app.installs_last_month
									? [{ text: formatInstalls(app.installs_last_month) }]
									: []
							}
							detail={<AppDetail app={app} />}
							actions={
								<ActionPanel>
									<Action
										title="Toggle Detail"
										icon={Icon.AppWindowSidebarLeft}
										onAction={() => setShowingDetail(!showingDetail)}
										shortcut={{ modifiers: ["cmd"], key: "d" }}
									/>
									<ActionPanel.Section>
										<Action
											title="Copy App ID"
											icon={Icon.Clipboard}
											onAction={async () => {
												await Clipboard.copy(app.app_id);
												await showToast({
													style: Toast.Style.Success,
													title: "Copied App ID",
													message: app.app_id,
												});
											}}
											shortcut={{ modifiers: ["cmd"], key: "c" }}
										/>
									<Action.OpenInBrowser
										title="Open on Flathub"
										url={`https://flathub.org/apps/${app.app_id}`}
										shortcut={{ modifiers: ["cmd"], key: "o" }}
										onOpen={async () => {
											await showToast({
												style: Toast.Style.Success,
												title: "Opening on Flathub",
												message: app.name,
											});
											await closeMainWindow();
										}}
									/>
										<Action.CopyToClipboard
											title="Copy Install Command"
											content={`flatpak install flathub ${app.app_id}`}
											shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
										/>
									</ActionPanel.Section>
								</ActionPanel>
							}
						/>
					))}
				</>
			)}
		</List>
	);
}

export default function FlathubSearch(props: LaunchProps) {
	return (
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
		>
			<FlathubSearchContent fallbackText={props.fallbackText} />
		</PersistQueryClientProvider>
	);
}
