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
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { BrowserSelector } from "./browser-selector";
import {
	flattenBookmarks,
	FlattenedBrowserBookmark,
	useBookmarks,
} from "./bookmarks";
import { extractHost } from "./utils";

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
				</List.Item.Detail.Metadata>
			}
		/>
	);
};

const BROWSER_FILTER_KEY = "browser-filter";

const BookmarkList = () => {
	const { roots, browsers, error, loading } = useBookmarks();
	const [browserFilter, setBrowserFilter] = useState<string>("all");
	const [showingDetail, setShowingDetail] = useState(false);

	useEffect(() => {
		LocalStorage.getItem(BROWSER_FILTER_KEY).then((v) =>
			setBrowserFilter(`${v}`),
		);
	}, []);

	const urlBookmarks = useMemo(
		() =>
			flattenBookmarks(roots).sort(
				(a, b) =>
					b.bookmark.dateAdded.getTime() - a.bookmark.dateAdded.getTime(),
			),
		[roots],
	);
	const filteredUrlBookmarks = useMemo(
		() =>
			browserFilter === "all"
				? urlBookmarks
				: urlBookmarks.filter((b) => b.browser.name === browserFilter),
		[urlBookmarks, browserFilter],
	);

	const handleBrowserFilterChange = async (s: string) => {
		await clearSearchBar();
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
			<List.Section title={`${filteredUrlBookmarks.length} bookmarks`}>
				{filteredUrlBookmarks.map(({ id, browser, bookmark, folder }) => (
					<List.Item
						key={id}
						subtitle={extractHost(bookmark.url) ?? undefined}
						title={bookmark.name}
						detail={<BookmarkDetail data={{ id, browser, bookmark, folder }} />}
						icon={Icon.Bookmark}
						accessories={!showingDetail ? [{ icon: browser.icon }] : []}
						actions={
							<ActionPanel>
								<Action
									title={"Open in browser"}
									onAction={async () => {
										await closeMainWindow();
										await open(bookmark.url);
									}}
								/>
								<Action
									title="Toggle bookmark details"
									icon={Icon.Bookmark}
									onAction={() => setShowingDetail((v) => !v)}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
};

export default function SimpleList() {
	return <BookmarkList />;
}
