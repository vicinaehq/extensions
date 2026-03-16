import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
	Action,
	ActionPanel,
	Clipboard,
	closeMainWindow,
	Icon,
	type LaunchProps,
	List,
	open,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	type FlathubApp,
	PERSIST_MAX_AGE,
	persister,
	queryClient,
	SEARCH_DEBOUNCE_MS,
} from "./api";
import { useAppDetails, useFlathubSearch, usePopularApps } from "./hooks";

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

function AppDetail({ app }: { app: FlathubApp }) {
	const { data: fullApp, isLoading } = useAppDetails(app);

	const displayApp = fullApp || app;

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
				if (!imgUrl) return null;
				// Convert WebP to PNG (Vicinae doesn't support WebP)
				const pngUrl = imgUrl.replace(/\.webp$/, ".png");
				const caption = screenshot.caption
					? `\n\n<p style="text-align: center;"><em>${screenshot.caption}</em></p>`
					: "";
				// Stack images vertically with separators
				return `<img src="${pngUrl}" alt="Screenshot ${idx + 1}" style="width: 100%; height: auto;" />${caption}`;
			})
			.filter((s): s is string => s !== null)
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

function AppActions({
	app,
	onToggleDetail,
}: {
	app: FlathubApp;
	onToggleDetail: () => void;
}) {
	return (
		<ActionPanel>
			<Action
				title="Toggle Detail"
				icon={Icon.AppWindowSidebarLeft}
				onAction={onToggleDetail}
				shortcut={{ modifiers: ["cmd"], key: "d" }}
			/>
			<ActionPanel.Section>
				<Action
					title="Open on Flathub"
					icon={Icon.Globe01}
					shortcut={{ modifiers: ["cmd"], key: "o" }}
					onAction={async () => {
						await open(`https://flathub.org/apps/${app.app_id}`);
						await closeMainWindow();
					}}
				/>
				<Action
					title="Copy App ID"
					icon={Icon.CopyClipboard}
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
				<Action.CopyToClipboard
					title="Copy Install Command"
					content={`flatpak install flathub ${app.app_id}`}
					shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);
}

function AppListItem({
	app,
	showingDetail,
	onToggleDetail,
}: {
	app: FlathubApp;
	showingDetail: boolean;
	onToggleDetail: () => void;
}) {
	return (
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
			actions={<AppActions app={app} onToggleDetail={onToggleDetail} />}
		/>
	);
}

function FlathubSearchContent({ fallbackText }: { fallbackText?: string }) {
	const [searchText, setSearchText] = useState(fallbackText || "");
	const [showingDetail, setShowingDetail] = useState(false);
	const debouncedSearch = useDebounce(searchText, SEARCH_DEBOUNCE_MS);

	const { data: popularApps = [], isLoading: loadingPopular } =
		usePopularApps();
	const {
		data: searchResults = [],
		isLoading: loadingSearch,
		isFetching: fetchingSearch,
	} = useFlathubSearch(debouncedSearch);

	const showingSearch = debouncedSearch.trim().length > 0;
	const displayed = showingSearch ? searchResults : popularApps;
	// Use isFetching for search so the spinner shows during keepPreviousData transitions
	const isLoading = showingSearch
		? loadingSearch || fetchingSearch
		: loadingPopular;
	const toggleDetail = () => setShowingDetail((prev) => !prev);

	return (
		<List
			isLoading={isLoading}
			isShowingDetail={showingDetail}
			searchBarPlaceholder="Search Flathub applications..."
			onSearchTextChange={setSearchText}
			searchText={searchText}
		>
			{showingSearch ? (
				displayed.length === 0 && !isLoading ? (
					<List.EmptyView
						title="No applications found"
						description="Try different search terms"
					/>
				) : (
					displayed.map((app) => (
						<AppListItem
							key={app.app_id}
							app={app}
							showingDetail={showingDetail}
							onToggleDetail={toggleDetail}
						/>
					))
				)
			) : (
				<List.Section title="Popular Applications">
					{displayed.map((app) => (
						<AppListItem
							key={app.app_id}
							app={app}
							showingDetail={showingDetail}
							onToggleDetail={toggleDetail}
						/>
					))}
				</List.Section>
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
