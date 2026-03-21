import { QueryClient, useQuery } from "@tanstack/react-query";
import {
	Action,
	ActionPanel,
	Cache,
	closeMainWindow,
	Color,
	Detail,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	PersistQueryClientProvider,
	type PersistedClient,
	type Persister,
} from "@tanstack/react-query-persist-client";
import type {
	ProtonDBConfidence,
	ProtonDBRating,
	ProtonDBTier,
	SteamAppDetails,
	SteamAppDetailsResponse,
	SteamFeaturedCategories,
	SteamFeaturedItem,
	SteamGame,
	SteamGenre,
} from "./types";

const STEAM_SEARCH_URL = "https://steamcommunity.com/actions/SearchApps";
const PROTONDB_RATING_URL = "https://www.protondb.com/api/v1/reports/summaries";
const STEAM_APPDETAILS_URL =
	"https://www.protondb.com/proxy/steam/api/appdetails";
const STEAM_FEATURED_URL =
	"https://store.steampowered.com/api/featuredcategories";
const SEARCH_DEBOUNCE_MS = 500;

// Fallback popular game IDs for when featured games API fails
const FALLBACK_GAME_IDS = [
	570, // Dota 2
	730, // Counter-Strike 2
	1172470, // Apex Legends
	1091500, // Cyberpunk 2077
	1086940, // Baldur's Gate 3
	1938090, // Call of Duty
	813780, // Age of Empires IV
	1623730, // Palworld
	2358720, // Black Myth: Wukong
	271590, // GTA V
];

// Query cache configuration
const QUERY_STALE_TIME = 12 * 60 * 60 * 1000; // 12 hours
const PERSIST_MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours

const cache = new Cache();
const PERSIST_KEY = "protondb-query-v1";

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
			staleTime: QUERY_STALE_TIME,
			gcTime: PERSIST_MAX_AGE,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

async function searchSteamGames(query: string): Promise<SteamGame[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const response = await fetch(
		`${STEAM_SEARCH_URL}/${encodeURIComponent(trimmed)}`,
	);
	if (!response.ok) {
		throw new Error(
			`Steam search failed: ${response.status} ${response.statusText}`,
		);
	}

	const games: SteamGame[] = await response.json();
	return games.slice(0, 20); // Limit to 20 results
}

async function fetchGamesByIds(appIds: number[]): Promise<SteamGame[]> {
	// Fetch all game details in parallel
	const gameDetailsPromises = appIds.map(async (appId) => {
		try {
			const detailsResponse = await fetch(
				`${STEAM_APPDETAILS_URL}?appids=${appId}`,
			);
			if (!detailsResponse.ok) return null;

			const detailsData: SteamAppDetailsResponse = await detailsResponse.json();
			const gameData = detailsData[appId];

			if (
				gameData?.success &&
				gameData?.data &&
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
		} catch (error) {
			console.error(`Failed to fetch game ${appId}:`, error);
			return null;
		}
	});

	const gameDetails = await Promise.all(gameDetailsPromises);
	const validGames = gameDetails.filter(
		(game): game is { appid: string; name: string; logo: string } =>
			game !== null,
	);

	// Batch fetch icons for all games in parallel
	const iconPromises = validGames.map(async (game) => {
		try {
			const searchResponse = await fetch(
				`${STEAM_SEARCH_URL}/${encodeURIComponent(game.name)}`,
			);
			if (searchResponse.ok) {
				const searchResults: SteamGame[] = await searchResponse.json();
				const matchingGame = searchResults.find((g) => g.appid === game.appid);
				return { appid: game.appid, icon: matchingGame?.icon || "" };
			}
		} catch (error) {
			console.error(`Failed to fetch icon for ${game.name}:`, error);
		}
		return { appid: game.appid, icon: "" };
	});

	const icons = await Promise.all(iconPromises);
	const iconMap = new Map(icons.map((i) => [i.appid, i.icon]));

	// Combine game details with icons
	return validGames.map((game) => ({
		...game,
		icon: iconMap.get(game.appid) || "",
	}));
}

async function fetchFeaturedGames(): Promise<SteamGame[]> {
	try {
		const response = await fetch(STEAM_FEATURED_URL);
		if (!response.ok) {
			throw new Error(`Steam featured API failed: ${response.status}`);
		}

		const data: SteamFeaturedCategories = await response.json();
		const topSellers = data.top_sellers?.items || [];
		const specials = data.specials?.items || [];

		const seenAppIds = new Set<number>();
		const STEAM_DECK_APP_ID = 1675200;

		// Combine top sellers and specials, deduplicate and filter out Steam Deck
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
	} catch (error) {
		console.error("Failed to fetch featured games:", error);
		showToast({
			style: Toast.Style.Failure,
			title: "Using fallback games",
			message: "Could not load featured games from Steam",
		});

		// Return fallback games
		const fallbackGames = await fetchGamesByIds(FALLBACK_GAME_IDS);
		return fallbackGames;
	}
}

async function fetchProtonDBRating(
	appId: string,
): Promise<ProtonDBRating | null> {
	try {
		const response = await fetch(`${PROTONDB_RATING_URL}/${appId}.json`);
		if (!response.ok) {
			if (response.status === 404) {
				// Game not in ProtonDB yet
				return null;
			}
			throw new Error(`ProtonDB request failed: ${response.status}`);
		}

		const rating: ProtonDBRating = await response.json();
		return rating;
	} catch (error) {
		console.error(`Failed to fetch ProtonDB rating for ${appId}:`, error);
		return null;
	}
}

async function fetchGameDetails(
	appId: string,
): Promise<SteamAppDetails | null> {
	try {
		const response = await fetch(`${STEAM_APPDETAILS_URL}?appids=${appId}`);
		if (!response.ok) {
			throw new Error(`Steam API request failed: ${response.status}`);
		}

		const data: SteamAppDetailsResponse = await response.json();
		const gameData = data[appId];

		if (gameData?.success && gameData?.data) {
			return gameData.data;
		}
		return null;
	} catch (error) {
		console.error(`Failed to fetch game details for ${appId}:`, error);
		return null;
	}
}

function getTierColor(tier: ProtonDBTier | undefined): Color {
	if (!tier) return Color.SecondaryText;

	const tierColors: Record<ProtonDBTier, Color> = {
		native: Color.Blue,
		platinum: Color.Purple,
		gold: Color.Yellow,
		silver: Color.Orange,
		bronze: Color.Orange,
		borked: Color.Red,
		pending: Color.SecondaryText,
	};

	return tierColors[tier] || Color.SecondaryText;
}

function getTierEmoji(tier: ProtonDBTier | undefined): string {
	if (!tier) return "❓";

	const tierEmojis: Record<ProtonDBTier, string> = {
		native: "🐧",
		platinum: "💎",
		gold: "🥇",
		silver: "🥈",
		bronze: "🥉",
		borked: "❌",
		pending: "❓",
	};

	return tierEmojis[tier] || "❓";
}

function formatTierName(tier: ProtonDBTier | undefined): string {
	if (!tier) return "Unknown";
	return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatConfidence(confidence: ProtonDBConfidence | undefined): string {
	if (!confidence) return "";
	return ` (${confidence} confidence)`;
}

function stripHtmlTags(html: string): string {
	if (!html) return "";

	return (
		html
			// Handle line breaks first
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/p>/gi, "\n\n")
			.replace(/<\/div>/gi, "\n")

			// Handle lists
			.replace(/<\/li>/gi, "\n")
			.replace(/<li[^>]*>/gi, "• ")
			.replace(/<\/?[ou]l[^>]*>/gi, "\n")

			// Handle headings
			.replace(/<\/h[1-6]>/gi, "\n\n")
			.replace(/<h[1-6][^>]*>/gi, "")

			// Preserve content in emphasis tags
			.replace(/<strong>(.*?)<\/strong>/gi, "$1")
			.replace(/<b>(.*?)<\/b>/gi, "$1")
			.replace(/<em>(.*?)<\/em>/gi, "$1")
			.replace(/<i>(.*?)<\/i>/gi, "$1")

			// Remove all other tags
			.replace(/<[^>]+>/g, "")

			// Decode common HTML entities
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&apos;/g, "'")

			// Clean up extra whitespace
			.replace(/\n\s*\n\s*\n/g, "\n\n") // Max 2 consecutive newlines
			.replace(/[ \t]+/g, " ") // Multiple spaces to single space
			.trim()
	);
}

function useDebounce<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(id);
	}, [value, delay]);
	return debounced;
}

function GameActions({
	game,
	rating,
	showDetailsAction,
}: {
	game: SteamGame;
	rating: ProtonDBRating | null;
	showDetailsAction?: React.ReactNode;
}) {
	return (
		<ActionPanel>
			{showDetailsAction}
			<Action.OpenInBrowser
				title="Open on ProtonDB"
				url={`https://www.protondb.com/app/${game.appid}`}
				icon={Icon.Globe}
				shortcut={
					showDetailsAction ? { modifiers: ["cmd"], key: "p" } : undefined
				}
				onOpen={async () => {
					await showToast({
						style: Toast.Style.Success,
						title: "Opening on ProtonDB",
						message: game.name,
					});
					await closeMainWindow();
				}}
			/>
			<Action.OpenInBrowser
				title="Open on Steam"
				url={`https://store.steampowered.com/app/${game.appid}`}
				icon={Icon.Store}
				shortcut={{ modifiers: ["cmd"], key: "s" }}
				onOpen={async () => {
					await showToast({
						style: Toast.Style.Success,
						title: "Opening on Steam",
						message: game.name,
					});
					await closeMainWindow();
				}}
			/>
			<Action.OpenInBrowser
				title="Open in Steam"
				url={`steam://store/${game.appid}`}
				icon={Icon.AppWindow}
				shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
				onOpen={async () => {
					await showToast({
						style: Toast.Style.Success,
						title: "Opening in Steam app",
						message: game.name,
					});
					await closeMainWindow();
				}}
			/>
			<ActionPanel.Section>
				<Action.CopyToClipboard
					title="Copy ProtonDB URL"
					content={`https://www.protondb.com/app/${game.appid}`}
					shortcut={{ modifiers: ["cmd"], key: "c" }}
				/>
				{rating && (
					<Action.CopyToClipboard
						title="Copy Compatibility Info"
						content={`${game.name}: ${formatTierName(rating.tier)} (${rating.total} reports, ${rating.confidence} confidence)`}
						shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
					/>
				)}
			</ActionPanel.Section>
		</ActionPanel>
	);
}

function GameDetail({ game }: { game: SteamGame }) {
	const { data: rating, isLoading: loadingRating } = useQuery({
		queryKey: ["protondb-rating", game.appid],
		queryFn: () => fetchProtonDBRating(game.appid),
	});

	const { data: gameDetails, isLoading: loadingDetails } = useQuery({
		queryKey: ["game-details", game.appid],
		queryFn: () => fetchGameDetails(game.appid),
		retry: 2,
		onError: (_error) => {
			showToast({
				style: Toast.Style.Failure,
				title: "Failed to load game details",
				message: "Could not fetch information from Steam",
			});
		},
	});

	// Build markdown conditionally to avoid layout shift
	// Only show image when gameDetails is loaded (has header_image)
	const markdown = gameDetails?.header_image
		? `![${game.name}](${gameDetails.header_image})
  
# ${game.name}

${gameDetails?.short_description || ""}`
		: `# ${game.name}

${gameDetails?.short_description || ""}`;

	const formatPercentage = (score: number) => {
		return `${Math.round(score * 100)}%`;
	};

	return (
		<Detail
			isLoading={loadingDetails}
			markdown={markdown}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="Steam App ID" text={game.appid} />

					{gameDetails && (
						<>
							{gameDetails.release_date?.date && (
								<Detail.Metadata.Label
									title="Release Date"
									text={gameDetails.release_date.date}
								/>
							)}
							{gameDetails.developers && gameDetails.developers.length > 0 && (
								<Detail.Metadata.Label
									title="Developer"
									text={gameDetails.developers.join(", ")}
								/>
							)}
							{gameDetails.publishers && gameDetails.publishers.length > 0 && (
								<Detail.Metadata.Label
									title="Publisher"
									text={gameDetails.publishers.join(", ")}
								/>
							)}
							{gameDetails.genres && gameDetails.genres.length > 0 && (
								<Detail.Metadata.TagList title="Genres">
									{gameDetails.genres.slice(0, 5).map((genre: SteamGenre) => (
										<Detail.Metadata.TagList.Item
											key={genre.id}
											text={genre.description}
										/>
									))}
								</Detail.Metadata.TagList>
							)}
							{gameDetails.price_overview && (
								<Detail.Metadata.Label
									title="Price"
									text={
										gameDetails.price_overview.discount_percent > 0
											? `${gameDetails.price_overview.final_formatted} (${gameDetails.price_overview.discount_percent}% off)`
											: gameDetails.price_overview.final_formatted
									}
								/>
							)}
							{!gameDetails.price_overview && gameDetails.is_free && (
								<Detail.Metadata.Label title="Price" text="Free to Play" />
							)}
							{gameDetails.metacritic?.score && (
								<Detail.Metadata.Label
									title="Metacritic Score"
									text={`${gameDetails.metacritic.score}/100`}
								/>
							)}
						</>
					)}

					{rating && (
						<>
							<Detail.Metadata.Separator />
							<Detail.Metadata.Label
								title="ProtonDB Rating"
								text={formatTierName(rating.tier)}
								icon={{
									source: Icon.Circle,
									tintColor: getTierColor(rating.tier),
								}}
							/>
							<Detail.Metadata.Label
								title="Confidence"
								text={
									rating.confidence.charAt(0).toUpperCase() +
									rating.confidence.slice(1)
								}
							/>
							<Detail.Metadata.Label
								title="Reports"
								text={`${rating.total} community reports`}
							/>
							<Detail.Metadata.Label
								title="Score"
								text={formatPercentage(rating.score)}
							/>
							<Detail.Metadata.Separator />
							<Detail.Metadata.Label
								title="Best Reported Tier"
								text={formatTierName(rating.bestReportedTier)}
								icon={{
									source: Icon.Circle,
									tintColor: getTierColor(rating.bestReportedTier),
								}}
							/>
							<Detail.Metadata.Label
								title="Trending Tier"
								text={formatTierName(rating.trendingTier)}
								icon={{
									source: Icon.Circle,
									tintColor: getTierColor(rating.trendingTier),
								}}
							/>
						</>
					)}

					{!rating && !loadingRating && (
						<>
							<Detail.Metadata.Separator />
							<Detail.Metadata.Label
								title="ProtonDB Rating"
								text="No reports available"
							/>
						</>
					)}

					{gameDetails?.pc_requirements && (
						<>
							<Detail.Metadata.Separator />
							<Detail.Metadata.Label
								title="System Requirements (PC)"
								text={stripHtmlTags(
									typeof gameDetails.pc_requirements === "string"
										? gameDetails.pc_requirements
										: gameDetails.pc_requirements.minimum || "",
								)}
							/>
						</>
					)}

					{gameDetails?.linux_requirements &&
						typeof gameDetails.linux_requirements === "object" &&
						gameDetails.linux_requirements.minimum &&
						stripHtmlTags(gameDetails.linux_requirements.minimum).length >
							0 && (
							<>
								<Detail.Metadata.Separator />
								<Detail.Metadata.Label
									title="System Requirements (Linux)"
									text={stripHtmlTags(gameDetails.linux_requirements.minimum)}
								/>
							</>
						)}
				</Detail.Metadata>
			}
			actions={<GameActions game={game} rating={rating} />}
		/>
	);
}

function GameListItem({ game }: { game: SteamGame }) {
	const { data: rating } = useQuery({
		queryKey: ["protondb-rating", game.appid],
		queryFn: () => fetchProtonDBRating(game.appid),
	});

	const tierText = !rating
		? ""
		: `${getTierEmoji(rating.tier)} ${formatTierName(rating.tier)}${formatConfidence(rating.confidence)}`;

	const accessories = [
		{
			text: tierText,
			...(rating && {
				tag: {
					value: formatTierName(rating.tier),
					color: getTierColor(rating.tier),
				},
			}),
		},
	];

	if (rating && rating.total > 0) {
		accessories.push({ text: `${rating.total} reports` });
	}

	return (
		<List.Item
			key={game.appid}
			title={game.name}
			icon={{ source: game.icon }}
			accessories={accessories}
			actions={
				<GameActions
					game={game}
					rating={rating}
					showDetailsAction={
						<Action.Push
							title="Show Details"
							target={
							<PersistQueryClientProvider
								client={queryClient}
								persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
							>
								<GameDetail game={game} />
							</PersistQueryClientProvider>
							}
							icon={Icon.Eye}
							shortcut={{ modifiers: ["cmd"], key: "d" }}
						/>
					}
				/>
			}
		/>
	);
}

function ProtonDBSearchContent() {
	const [searchText, setSearchText] = useState("");
	const debouncedSearch = useDebounce(searchText, SEARCH_DEBOUNCE_MS);

	// Featured games query (when no search)
	const { data: featuredGames = [], isLoading: loadingFeatured } = useQuery({
		queryKey: ["featured-games"],
		queryFn: fetchFeaturedGames,
	});

	// Search query
	const {
		data: searchResults = [],
		isLoading: loadingSearch,
		isError,
		error,
	} = useQuery({
		queryKey: ["steam-search", debouncedSearch],
		queryFn: () => searchSteamGames(debouncedSearch),
		enabled: debouncedSearch.trim().length > 0,
	});

	if (isError && error) {
		showToast({
			style: Toast.Style.Failure,
			title: "Search failed",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}

	const showingSearch = debouncedSearch.trim().length > 0;
	const games = showingSearch ? searchResults : featuredGames;
	const isLoading = showingSearch ? loadingSearch : loadingFeatured;

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder="Search Steam games..."
			onSearchTextChange={setSearchText}
		>
			{games.length === 0 && !isLoading ? (
				showingSearch ? (
					<List.EmptyView
						title="No games found"
						description="Try different search terms"
						icon={Icon.XMarkCircle}
					/>
				) : (
					<List.EmptyView
						title="Search Steam Games"
						description="Type to search for games and see their ProtonDB compatibility ratings"
						icon={Icon.MagnifyingGlass}
					/>
				)
			) : (
				<>
					{!showingSearch && games.length > 0 && (
						<List.Section title="Featured Games" />
					)}
					{showingSearch && games.length > 0 && (
						<List.Section title={`${games.length} Games Found`} />
					)}
					{games.map((game) => (
						<GameListItem key={game.appid} game={game} />
					))}
				</>
			)}
		</List>
	);
}

export default function ProtonDBSearch() {
	return (
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
		>
			<ProtonDBSearchContent />
		</PersistQueryClientProvider>
	);
}
