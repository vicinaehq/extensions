import {
	Action,
	ActionPanel,
	clearSearchBar,
	closeMainWindow,
	Icon,
	List,
	open,
	LocalStorage,
	Detail,
	Color,
	showToast,
	Toast,
	getPreferenceValues,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { BrowserSelector } from "./browser-selector";
import {
	addFavorite,
	FlattenedBrowserBookmark,
	removeFavorite,
	useBookmarks,
} from "./bookmarks";
import { extractHost, faviconIcon } from "./utils";

type Preferences = {
	"show-favicons": boolean;
	"bookmark-render-limit": string;
	"show-url-in-subtitle": boolean;
};

const getShortcutName = (bookmark: FlattenedBrowserBookmark["bookmark"]) => {
	const name = bookmark.name.trim();

	if (name) {
		return name;
	}

	return extractHost(bookmark.url) ?? bookmark.url;
};

const BookmarkDetail = ({ data }: { data: FlattenedBrowserBookmark }) => {
	return (
		<List.Item.Detail
			metadata={
				<List.Item.Detail.Metadata>
					<List.Item.Detail.Metadata.Label
						title={"ID"}
						icon={Icon.Fingerprint}
						text={{ value: data.bookmark.id }}
					/>
					<List.Item.Detail.Metadata.Label
						title="Name"
						text={data.bookmark.name}
					/>
					<List.Item.Detail.Metadata.Label
						title="URL"
						text={{ value: data.bookmark.url }}
					/>
					<List.Item.Detail.Metadata.Label
						title="Added at"
						text={{ value: data.bookmark.dateAdded.toJSON() }}
					/>

					{data.folder && (
						<List.Item.Detail.Metadata.Label
							title="Folder"
							icon={Icon.Folder}
							text={{ value: data.folder }}
						/>
					)}
					<List.Item.Detail.Metadata.Label
						title="Browser"
						icon={data.browser.icon}
						text={{ value: data.browser.name }}
					/>

					<List.Item.Detail.Metadata.Label
						title="Profile"
						text={{ value: data.profile }}
					/>
				</List.Item.Detail.Metadata>
			}
		/>
	);
};

const BROWSER_FILTER_KEY = "browser-filter";

const BookmarkList = () => {
	const { bookmarks, browsers, error, loading } = useBookmarks();
  const preferences = getPreferenceValues<Preferences>();
  const showFavicons = preferences["show-favicons"] ?? false;
  const showUrlInSubtitle = preferences["show-url-in-subtitle"] ?? false;

	const parsedDisplayLimit = Number.parseInt(
	preferences["bookmark-render-limit"] ?? "100",
	10,
);

	const displayLimit =
		Number.isFinite(parsedDisplayLimit) && parsedDisplayLimit >= 0
			? parsedDisplayLimit
			: 100;

	const [browserFilter, setBrowserFilter] = useState<string>("all");
	const [searchText, setSearchText] = useState("");
	const [showingDetail, setShowingDetail] = useState(false);
	const [localBookmarks, setLocalBookmarks] = useState<
		FlattenedBrowserBookmark[]
	>([]);

	useEffect(() => {
		LocalStorage.getItem(BROWSER_FILTER_KEY).then((v) =>
			setBrowserFilter(v ? `${v}` : "all"),
		);
	}, []);

	useEffect(() => {
		setLocalBookmarks(bookmarks);
	}, [bookmarks]);

	useEffect(() => {
		if (browserFilter === "all") return;
		if (!browsers.length) return;

		const filterStillExists = browsers.some(
			(browser) => browser.id === browserFilter,
		);

		if (!filterStillExists) {
			setBrowserFilter("all");
			LocalStorage.setItem(BROWSER_FILTER_KEY, "all");
		}
	}, [browserFilter, browsers]);

	const { filteredUrlBookmarks, totalMatchingBookmarks } = useMemo(() => {
		const query = searchText.trim().toLowerCase();

		let items =
			browserFilter === "all"
				? localBookmarks
				: localBookmarks.filter((item) => item.browser.id === browserFilter);

		if (query) {
				items = items.filter((item) => {
					const host = extractHost(item.bookmark.url);

				return [
						item.bookmark.name,
						item.bookmark.url,
					host,
						item.folder,
						item.browser.name,
				].some((value) => value?.toLowerCase().includes(query));
			});
		}

	const total = items.length;
		const visible = displayLimit > 0 ? items.slice(0, displayLimit) : items;

	return {
		filteredUrlBookmarks: visible,
		totalMatchingBookmarks: total,
	};
}, [localBookmarks, browserFilter, searchText, displayLimit]);

	const sortLocalBookmarks = (items: FlattenedBrowserBookmark[]) => {
		return [...items].sort((a, b) => {
			const favoriteDiff = Number(b.favorite) - Number(a.favorite);

			if (favoriteDiff !== 0) {
				return favoriteDiff;
			}

			return b.bookmark.dateAdded.getTime() - a.bookmark.dateAdded.getTime();
		});
	};

	const addToFavorites = async (id: string) => {
		await addFavorite(id);
		setLocalBookmarks((previous) =>
			sortLocalBookmarks(
			previous.map((b) =>
				b.bookmark.id === id ? { ...b, favorite: true } : b,
					),
			),
		);
		await showToast({
			title: "Added to favorites",
			style: Toast.Style.Success,
		});
	};

	const removeFromFavorites = async (id: string) => {
		await removeFavorite(id);
		setLocalBookmarks((previous) =>
			sortLocalBookmarks(
			previous.map((b) =>
				b.bookmark.id === id ? { ...b, favorite: false } : b,
					),
			),
		);

		await showToast({
			title: "Removed from favorites",
			style: Toast.Style.Success,
		});
	};

	const handleBrowserFilterChange = async (s: string) => {
		await clearSearchBar();
		setSearchText("");
		setBrowserFilter(s);
		await LocalStorage.setItem(BROWSER_FILTER_KEY, s);
	};

	if (error) {
		return (
			<Detail
				markdown={`# Failed to load bookmarks\n\`\`\`\n${error}\n\`\`\``}
			/>
		);
	}

	return (
		<List
			isLoading={loading}
			isShowingDetail={showingDetail}
			searchBarPlaceholder="Search bookmarks..."
			filtering={false}
			onSearchTextChange={setSearchText}
			searchBarAccessory={
				<BrowserSelector
					filter={browserFilter}
					browsers={browsers}
					onChange={handleBrowserFilterChange}
				/>
			}
		>
			{!loading && (
				<List.EmptyView
					title="No bookmark"
					description="No bookmark matches your search. You may want to adjust the filter."
					icon={Icon.Bookmark}
				/>
			)}

			<List.Section title={
						displayLimit > 0 && filteredUrlBookmarks.length < totalMatchingBookmarks
							? `Showing ${filteredUrlBookmarks.length} of ${totalMatchingBookmarks} bookmarks`
							: `${totalMatchingBookmarks} bookmarks`
					}
				>
				{filteredUrlBookmarks.map(
					({ id, browser, bookmark, folder, favorite, profile }) => (
						<List.Item
							key={id}
							subtitle={
								showUrlInSubtitle
									? bookmark.url
									: extractHost(bookmark.url) ?? undefined
							}
							title={bookmark.name}
							detail={
								<BookmarkDetail
									data={{ id, browser, bookmark, folder, favorite, profile }}
								/>
							}
							icon={faviconIcon({
								url: bookmark.url,
								favorite,
								enabled: showFavicons,
							})}
							accessories={!showingDetail ? [
											...(showFavicons && favorite
												? [
														{
															icon: {
																source: Icon.Star,
																tintColor: "#fffac1",
															},
														},
													]
												: []),
											{ icon: browser.icon },
										]
									: []
							}
							actions={
								<ActionPanel>
									<Action
										title="Open in Browser"
										icon={Icon.Globe}
										onAction={async () => {
											await closeMainWindow();
											await open(bookmark.url);
										}}
									/>
									<Action.CopyToClipboard
										title="Copy URL"
										content={bookmark.url}
									/>
									<Action
										title="Toggle Bookmark Details"
										icon={Icon.Bookmark}
										shortcut={{ modifiers: ["ctrl"], key: "d" }}
										onAction={() => setShowingDetail((v) => !v)}
									/>
									{!favorite && (
										<Action
											title="Add to Favorites"
											icon={Icon.Star}
											shortcut={{ modifiers: ["ctrl"], key: "f" }}
											onAction={() => addToFavorites(bookmark.id)}
										/>
									)}
									{favorite && (
										<Action
											title="Remove from Favorites"
											icon={Icon.StarDisabled}
											shortcut={{ modifiers: ["ctrl"], key: "f" }}
											onAction={() => removeFromFavorites(bookmark.id)}
										/>
									)}
									<Action.CreateQuicklink
										title="Create Shortcut"
										icon={Icon.Link}
										shortcut={{ modifiers: ["ctrl"], key: "s" }}
										quicklink={{
											name: getShortcutName(bookmark),
											link: bookmark.url,
											icon: Icon.Bookmark,
										}}
									/>
									<Action
										title="Extension Settings"
										icon={Icon.Cog}
										onAction={() => open("vicinae://settings/open?tab=@aurelleb/chromium-bookmarks")}
										shortcut={{ modifiers: ["ctrl"], key: "," }}
									/>
								</ActionPanel>
							}
						/>
					),
				)}
			</List.Section>
		</List>
	);
};

export default function SimpleList() {
	return <BookmarkList />;
}
