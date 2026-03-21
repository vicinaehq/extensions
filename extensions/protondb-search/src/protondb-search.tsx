import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
	Action,
	ActionPanel,
	closeMainWindow,
	Color,
	Detail,
	Icon,
	Keyboard,
	List,
	open,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState, type ReactNode } from "react";
import {
	PersistQueryClientProvider,
} from "@tanstack/react-query-persist-client";
import {
	fetchFeaturedGames,
	fetchGameDetails,
	fetchProtonDBRating,
	PERSIST_MAX_AGE,
	persister,
	queryClient,
	SEARCH_DEBOUNCE_MS,
	searchSteamGames,
} from "./api";
import type {
	ProtonDBConfidence,
	ProtonDBTier,
	SteamGame,
	SteamGenre,
	ProtonDBRating,
	SteamAppDetails,
} from "./types";

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
	showDetailsAction?: ReactNode;
}) {
	async function openExternal(target: string, title: string) {
		await open(target);
		await showToast({
			style: Toast.Style.Success,
			title,
			message: game.name,
		});
		await closeMainWindow();
	}

	return (
		<ActionPanel>
			{showDetailsAction}
			<Action
				title="Open on ProtonDB"
				onAction={() =>
					openExternal(
						`https://www.protondb.com/app/${game.appid}`,
						"Opening on ProtonDB",
					)
				}
				icon={Icon.Globe01}
				shortcut={Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common}
			/>
			<Action
				title="Open on Steam"
				onAction={() =>
					openExternal(
						`https://store.steampowered.com/app/${game.appid}`,
						"Opening on Steam",
					)
				}
				icon={Icon.Store}
				shortcut={{ modifiers: ["cmd"], key: "s" }}
			/>
			<Action
				title="Open in Steam"
				onAction={() =>
					openExternal(`steam://store/${game.appid}`, "Opening in Steam app")
				}
				icon={Icon.AppWindow}
				shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
			/>
			<ActionPanel.Section>
				<Action.CopyToClipboard
					title="Copy ProtonDB URL"
					content={`https://www.protondb.com/app/${game.appid}`}
					shortcut={Keyboard.Shortcut.Common.Copy as Keyboard.Shortcut.Common}
				/>
				{rating && (
					<Action.CopyToClipboard
						title="Copy Compatibility Info"
						content={`${game.name}: ${formatTierName(rating.tier)} (${rating.total} reports, ${rating.confidence} confidence)`}
						shortcut={
							Keyboard.Shortcut.Common.CopyName as Keyboard.Shortcut.Common
						}
					/>
				)}
			</ActionPanel.Section>
		</ActionPanel>
	);
}

function GameDetail({ game }: { game: SteamGame }) {
	const { data: rating, isLoading: loadingRating } = useQuery<ProtonDBRating | null>({
		queryKey: ["protondb-rating", game.appid],
		queryFn: () => fetchProtonDBRating(game.appid),
	});

	const { data: gameDetails, isLoading: loadingDetails } = useQuery<SteamAppDetails | null>({
		queryKey: ["game-details", game.appid],
		queryFn: () => fetchGameDetails(game.appid),
		retry: 2,
	});

	const markdown = loadingDetails
		? `# ${game.name}\n\nLoading game details...`
		: gameDetails?.header_image
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

function ProtonDBSearchContent({ isRestoring }: { isRestoring: boolean }) {
	const [searchText, setSearchText] = useState("");
	const debouncedSearch = useDebounce(searchText, SEARCH_DEBOUNCE_MS);

	const { data: featuredGames = [], isLoading: loadingFeatured } = useQuery({
		queryKey: ["featured-games"],
		queryFn: fetchFeaturedGames,
	});

	const {
		data: searchResults = [],
		isLoading: loadingSearch,
		isFetching: fetchingSearch,
	} = useQuery({
		queryKey: ["steam-search", debouncedSearch],
		queryFn: () => searchSteamGames(debouncedSearch),
		enabled: debouncedSearch.trim().length > 0,
		placeholderData: keepPreviousData,
	});

	const showingSearch = debouncedSearch.trim().length > 0;
	const games = showingSearch ? searchResults : featuredGames;
	const isLoading =
		isRestoring || (showingSearch ? loadingSearch || fetchingSearch : loadingFeatured);

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
	const [isRestored, setIsRestored] = useState(false);

	return (
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
			onSuccess={() => setIsRestored(true)}
		>
			<ProtonDBSearchContent isRestoring={isRestored === false} />
		</PersistQueryClientProvider>
	);
}
