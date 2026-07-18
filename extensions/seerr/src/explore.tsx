import {
	Action,
	ActionPanel,
	Cache,
	Color,
	Detail,
	getPreferenceValues,
	Grid,
	Icon,
	List,
	openExtensionPreferences,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { authenticate, fetchTrending, searchMedia } from "./api";
import {
	ASPECT_RATIO,
	duplicateKey,
	formatRating,
	getTitle,
	getYear,
	GRID_COLUMNS,
	mergeUnique,
	posterSource,
	posterUrl,
} from "./helpers";
import Entity from "./entity";
import GenreBrowser from "./genre-browser";
import MediaActions from "./media-actions";
import type { MediaResult, Preferences } from "./types";

const CACHE_TTL = 5 * 60 * 1000;

const cache = new Cache({ namespace: "seerr", ttl: CACHE_TTL });

const STATUS_MAP: Record<number, { label: string; color: Color }> = {
	1: { label: "Unknown", color: Color.SecondaryText },
	2: { label: "Pending", color: Color.Orange },
	3: { label: "Processing", color: Color.Yellow },
	4: { label: "Partial", color: Color.Blue },
	5: { label: "Available", color: Color.Green },
};

function statusAccessory(
	mediaInfo: { status: number } | undefined,
): List.Item.Accessory | null {
	if (!mediaInfo || mediaInfo.status === 1) return null;
	const info = STATUS_MAP[mediaInfo.status];
	if (!info) return null;
	return { tag: { value: info.label, color: info.color } };
}

function useDebounce() {
	const ref = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(ref.current), []);
	return ref;
}

export default function Command() {
	const {
		"server-url": serverUrl,
		"login-type": loginType,
		username = "",
		password = "",
		"view-mode": viewMode = "grid",
	} = getPreferenceValues<Preferences>();
	const [media, setMedia] = useState<MediaResult[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSearching, setIsSearching] = useState(false);
	const [cookie, setCookie] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [mediaTypeFilter, setMediaTypeFilter] = useState<
		"all" | "movie" | "tv"
	>("all");
	const debounceRef = useDebounce();

	const loadTrending = useCallback(
		async (nextPage = 1) => {
			if (!cookie) return;
			if (nextPage === 1) setIsLoading(true);
			setError(null);
			try {
				const cacheKey = `trending:${mediaTypeFilter}:${nextPage}`;
				const cached = cache.get(cacheKey);
				if (cached && nextPage === 1) {
					const data = JSON.parse(cached) as {
						results: MediaResult[];
						totalPages: number;
					};
					setMedia(data.results);
					setTotalPages(data.totalPages);
					setIsLoading(false);
					return;
				}
				const data = await fetchTrending(
					serverUrl,
					cookie,
					nextPage,
					mediaTypeFilter === "all" ? undefined : mediaTypeFilter,
				);
				const results = data.results.filter(
					(r) => r.mediaType === "movie" || r.mediaType === "tv",
				);
				setMedia((prev) =>
					nextPage === 1 ? results : mergeUnique(prev, results),
				);
				setTotalPages(data.totalPages);
				setPage(nextPage);
				cache.set(
					cacheKey,
					JSON.stringify({ results, totalPages: data.totalPages }),
				);
			} catch (err) {
				setError(String(err));
			}
			setIsLoading(false);
		},
		[serverUrl, cookie, mediaTypeFilter],
	);

	useEffect(() => {
		(async () => {
			setIsLoading(true);
			setError(null);
			try {
				const sessionCookie = await authenticate(
					serverUrl,
					loginType,
					username,
					password,
				);
				setCookie(sessionCookie);
			} catch (error) {
				setError(String(error));
			}
			setIsLoading(false);
		})();
	}, [serverUrl, loginType, username, password]);

	useEffect(() => {
		if (cookie && !searchQuery) {
			setPage(1);
			loadTrending(1);
		}
	}, [cookie, loadTrending, searchQuery]);

	function handleSearchChange(text: string) {
		setSearchQuery(text);
		if (debounceRef.current) clearTimeout(debounceRef.current);

		if (!text.trim()) {
			setPage(1);
			loadTrending(1);
			return;
		}

		debounceRef.current = setTimeout(async () => {
			if (!cookie) return;
			setIsSearching(true);
			setPage(1);
			try {
				const cacheKey = `search:${text}:1`;
				const cached = cache.get(cacheKey);
				if (cached) {
					const data = JSON.parse(cached) as {
						results: MediaResult[];
						totalPages: number;
					};
					setMedia(data.results);
					setTotalPages(data.totalPages);
					setIsSearching(false);
					return;
				}
				const data = await searchMedia(serverUrl, cookie, text, 1);
				const results = data.results.filter(
					(r) => r.mediaType === "movie" || r.mediaType === "tv",
				);
				setMedia(results);
				setTotalPages(data.totalPages);
				cache.set(
					cacheKey,
					JSON.stringify({ results, totalPages: data.totalPages }),
				);
			} catch (err) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Search failed",
					message: String(err),
				});
			}
			setIsSearching(false);
		}, 400);
	}

	const loading = isLoading || isSearching;
	const hasMore = page < totalPages;

	async function loadMore() {
		if (!cookie || !hasMore) return;
		const nextPage = page + 1;
		if (searchQuery.trim()) {
			setIsSearching(true);
			try {
				const data = await searchMedia(
					serverUrl,
					cookie,
					searchQuery,
					nextPage,
				);
				const results = data.results.filter(
					(r) => r.mediaType === "movie" || r.mediaType === "tv",
				);
				setMedia((prev) => mergeUnique(prev, results));
				setPage(nextPage);
				setTotalPages(data.totalPages);
			} catch (err) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Failed to load more",
					message: String(err),
				});
			}
			setIsSearching(false);
		} else {
			await loadTrending(nextPage);
		}
	}

	const filteredMedia =
		mediaTypeFilter === "all"
			? media
			: media.filter((item) => item.mediaType === mediaTypeFilter);

	if (error) {
		return (
			<Detail
				markdown={`# Connection Error

${error}

Please check:
- Your Seerr server URL is correct
- The server is running and accessible
- Your login credentials are correct`}
				actions={
					<ActionPanel>
						<Action
							title="Open Extension Settings"
							icon={Icon.Cog}
							onAction={openExtensionPreferences}
						/>
					</ActionPanel>
				}
			/>
		);
	}

	const hasSearched = searchQuery.trim().length > 0;

	if (viewMode === "list") {
		return (
			<List
				isLoading={loading}
				searchText={searchQuery}
				onSearchTextChange={handleSearchChange}
				searchBarPlaceholder="Search movies and shows..."
				pagination={{ onLoadMore: loadMore, hasMore }}
				filtering={false}
				isShowingDetail
				searchBarAccessory={
					<List.Dropdown
						tooltip="Filter by type"
						value={mediaTypeFilter}
						onChange={(v) => setMediaTypeFilter(v as "all" | "movie" | "tv")}
					>
						<List.Dropdown.Item title="All" value="all" />
						<List.Dropdown.Item title="Movies" value="movie" />
						<List.Dropdown.Item title="TV Shows" value="tv" />
					</List.Dropdown>
				}
			>
				{!hasSearched && media.length === 0 && !loading && (
					<List.EmptyView
						icon={Icon.MagnifyingGlass}
						title="Search for movies and shows"
						description="Type a title to search Seerr"
					/>
				)}
				{hasSearched && filteredMedia.length === 0 && !loading && (
					<List.EmptyView
						icon={Icon.FilmStrip}
						title="No results found"
						description="Try a different search term"
					/>
				)}
				{filteredMedia.length > 0 && (
					<List.Section title={hasSearched ? "Results" : "Trending"}>
						{filteredMedia.map((item) => {
							const title = getTitle(item);
							const poster = posterUrl(item.posterPath);
							const year = getYear(item);
							const rating = formatRating(item.voteAverage);
							const statusAcc = statusAccessory(item.mediaInfo);
							const accessories: List.Item.Accessory[] = [];
							if (statusAcc) accessories.push(statusAcc);
							if (item.voteAverage) {
								accessories.push({
									tag: {
										value: rating,
										color:
											item.voteAverage >= 7
												? Color.Green
												: item.voteAverage >= 5
													? Color.Yellow
													: Color.Red,
									},
								});
							}
							accessories.push({
								tag: {
									value: item.mediaType === "movie" ? "Movie" : "TV",
									color: item.mediaType === "movie" ? Color.Blue : Color.Purple,
								},
							});

							return (
								<List.Item
									key={duplicateKey(item)}
									id={duplicateKey(item)}
									title={title}
									subtitle={year}
									icon={
										poster
											? posterSource(poster, title)
											: { source: Icon.FilmStrip }
									}
									accessories={accessories}
									detail={
										<List.Item.Detail
											markdown={
												poster
													? `![${title}](${poster})

${item.overview || ""}`
													: `# ${title}

${item.overview || ""}`
											}
											metadata={
												<List.Item.Detail.Metadata>
													<List.Item.Detail.Metadata.Label
														title="Type"
														text={
															item.mediaType === "movie" ? "Movie" : "TV Show"
														}
													/>
													{year && (
														<List.Item.Detail.Metadata.Label
															title="Year"
															text={year}
														/>
													)}
													<List.Item.Detail.Metadata.Label
														title="Rating"
														text={rating || "N/A"}
													/>
													<List.Item.Detail.Metadata.Label
														title="Votes"
														text={item.voteCount?.toLocaleString() || "N/A"}
													/>
												</List.Item.Detail.Metadata>
											}
										/>
									}
									actions={
										<ActionPanel>
											<Action.Push
												title="View Details"
												icon={Icon.Eye}
												shortcut={{ modifiers: ["cmd"], key: "d" }}
												target={
													<Entity
														media={item}
														serverUrl={serverUrl}
														cookie={cookie || ""}
													/>
												}
											/>
											<MediaActions
												item={item}
												serverUrl={serverUrl}
												cookie={cookie || ""}
											/>
											<ActionPanel.Submenu title="Browse" icon={Icon.Globe01}>
												<Action.Push
													title="Browse Movie Genres"
													icon={Icon.Tag}
													target={
														<GenreBrowser
															serverUrl={serverUrl}
															cookie={cookie || ""}
															mediaType="movie"
														/>
													}
												/>
												<Action.Push
													title="Browse TV Genres"
													icon={Icon.Tag}
													target={
														<GenreBrowser
															serverUrl={serverUrl}
															cookie={cookie || ""}
															mediaType="tv"
														/>
													}
												/>
											</ActionPanel.Submenu>
										</ActionPanel>
									}
								/>
							);
						})}
					</List.Section>
				)}
			</List>
		);
	}

	return (
		<Grid
			isLoading={loading}
			searchText={searchQuery}
			onSearchTextChange={handleSearchChange}
			searchBarPlaceholder="Search movies and shows..."
			pagination={{ onLoadMore: loadMore, hasMore }}
			filtering={false}
			columns={GRID_COLUMNS}
			aspectRatio={ASPECT_RATIO}
			fit={Grid.Fit.Fill}
			inset={Grid.Inset.Small}
			searchBarAccessory={
				<Grid.Dropdown
					tooltip="Filter by type"
					value={mediaTypeFilter}
					onChange={(v) => setMediaTypeFilter(v as "all" | "movie" | "tv")}
				>
					<Grid.Dropdown.Item title="All" value="all" />
					<Grid.Dropdown.Item title="Movies" value="movie" />
					<Grid.Dropdown.Item title="TV Shows" value="tv" />
				</Grid.Dropdown>
			}
		>
			{!hasSearched && filteredMedia.length === 0 && !loading && (
				<Grid.EmptyView
					icon={Icon.MagnifyingGlass}
					title="Search for movies and shows"
					description="Type a title to search Seerr"
				/>
			)}
			{hasSearched && filteredMedia.length === 0 && !loading && (
				<Grid.EmptyView
					icon={Icon.FilmStrip}
					title="No results found"
					description="Try a different search term"
				/>
			)}
			{filteredMedia.length > 0 && (
				<Grid.Section title={hasSearched ? "Results" : "Trending"}>
					{filteredMedia.map((item) => {
						const title = getTitle(item);
						const poster = posterUrl(item.posterPath);
						const statusLabel =
							item.mediaInfo && item.mediaInfo.status !== 1
								? STATUS_MAP[item.mediaInfo.status]?.label
								: undefined;

						return (
							<Grid.Item
								key={duplicateKey(item)}
								id={duplicateKey(item)}
								title={title}
								content={
									poster
										? posterSource(poster, title)
										: { source: Icon.FilmStrip }
								}
								accessory={statusLabel ? { tooltip: statusLabel } : undefined}
								actions={
									<ActionPanel>
										<Action.Push
											title="View Details"
											icon={Icon.Eye}
											shortcut={{ modifiers: ["cmd"], key: "d" }}
											target={
												<Entity
													media={item}
													serverUrl={serverUrl}
													cookie={cookie || ""}
												/>
											}
										/>
										<MediaActions
											item={item}
											serverUrl={serverUrl}
											cookie={cookie || ""}
										/>
										<ActionPanel.Submenu title="Browse" icon={Icon.Globe01}>
											<Action.Push
												title="Browse Movie Genres"
												icon={Icon.Tag}
												target={
													<GenreBrowser
														serverUrl={serverUrl}
														cookie={cookie || ""}
														mediaType="movie"
													/>
												}
											/>
											<Action.Push
												title="Browse TV Genres"
												icon={Icon.Tag}
												target={
													<GenreBrowser
														serverUrl={serverUrl}
														cookie={cookie || ""}
														mediaType="tv"
													/>
												}
											/>
										</ActionPanel.Submenu>
									</ActionPanel>
								}
							/>
						);
					})}
				</Grid.Section>
			)}
		</Grid>
	);
}
