import {
	Action,
	ActionPanel,
	showToast,
	Toast,
	Grid,
	environment,
	Icon,
	Detail,
	LocalStorage,
	WindowManagement,
	Keyboard,
} from "@vicinae/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadAndSetWallpaper } from "./downloads";
import {
	aspectRatio,
	formatResolution,
	parseResolution,
	Resolution,
} from "./system";
import { searchWallpapers, WallpaperResult } from "./wallhaven";

const DEFAULT_FILTER = "1920x1080";

const commonResolutions = [
	{ id: "1920x1080", alias: "Full HD" },
	{ id: "2560x1440", alias: "QHD" },
	{ id: "3440x1440", alias: "UWQHD" },
	{ id: "5120x1440", alias: "DQHD" },
	{ id: "3840x2160", alias: "4K UHD" },
	{ id: "5120x2880", alias: "5K" },
	{ id: "7680x4320", alias: "8K UHD" },
];

const RATIO_PREFIX = "ratio:";

const commonRatios = [
	{ id: "ratio:16x9", title: "16:9" },
	{ id: "ratio:16x10", title: "16:10" },
	{ id: "ratio:21x9", title: "21:9 (Ultrawide)" },
	{ id: "ratio:32x9", title: "32:9 (Super ultrawide)" },
	{ id: "ratio:4x3", title: "4:3" },
	{ id: "ratio:9x16", title: "9:16 (Portrait)" },
];

type SearchFilter = { kind: "resolution" | "ratio" } & Resolution;

const parseFilter = (value: string): SearchFilter =>
	value.startsWith(RATIO_PREFIX)
		? { kind: "ratio", ...parseResolution(value.slice(RATIO_PREFIX.length)) }
		: { kind: "resolution", ...parseResolution(value) };

const filterRatio = (filter: SearchFilter): [number, number] =>
	filter.kind === "ratio" ? [filter.width, filter.height] : aspectRatio(filter);

const FILTER_STORAGE_KEY = "search-filter";

function useStoredFilter() {
	const [filter, setFilter] = useState<string | null>();

	useEffect(() => {
		LocalStorage.getItem<string>(FILTER_STORAGE_KEY).then(
			(value) => setFilter(value ?? null),
			() => setFilter(null),
		);
	}, []);

	const update = useCallback((value: string) => {
		setFilter(value);
		LocalStorage.setItem(FILTER_STORAGE_KEY, value);
	}, []);

	return [filter, update] as const;
}

function useScreens() {
	const [screens, setScreens] = useState<WindowManagement.Screen[]>();

	useEffect(() => {
		if (!environment.canAccess(WindowManagement)) {
			setScreens([]);
			return;
		}
		WindowManagement.getScreens().then(setScreens, () => setScreens([]));
	}, []);

	return screens;
}

function useWallpaperSearch(query: string, filterValue: string | undefined) {
	const [wallpapers, setWallpapers] = useState<WallpaperResult[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [hasMore, setHasMore] = useState(false);
	const search = useRef({ id: 0, page: 1 });

	const fetchPage = useCallback(
		async (page: number, append: boolean) => {
			if (!filterValue) return;
			const id = ++search.current.id;
			setIsLoading(true);
			try {
				const filter = parseFilter(filterValue);
				const res = await searchWallpapers({
					query,
					page,
					atLeast:
						filter.kind === "resolution" ? formatResolution(filter) : undefined,
					ratios: [filterRatio(filter).join("x")],
					sorting: query.length === 0 ? "random" : "relevance",
				});
				if (id !== search.current.id) return;
				search.current.page = page;
				setWallpapers((prev) => (append ? [...prev, ...res.data] : res.data));
				setHasMore(res.meta.current_page < res.meta.last_page);
			} catch (error) {
				if (id !== search.current.id) return;
				showToast({
					title: "Failed to search wallpapers",
					message: error instanceof Error ? error.message : undefined,
					style: Toast.Style.Failure,
				});
			} finally {
				if (id === search.current.id) setIsLoading(false);
			}
		},
		[query, filterValue],
	);

	useEffect(() => {
		fetchPage(1, false);
	}, [fetchPage]);

	const loadMore = useCallback(() => {
		fetchPage(search.current.page + 1, true);
	}, [fetchPage]);

	return { wallpapers, isLoading, hasMore, loadMore };
}

type FilterDropdownProps = {
	screens: WindowManagement.Screen[];
	value: string;
	onChange: (value: string) => void;
};

function FilterDropdown({ screens, value, onChange }: FilterDropdownProps) {
	const screenResolutions = screens.map((s) =>
		formatResolution(s.physicalResolution),
	);

	return (
		<Grid.Dropdown value={value} onChange={onChange}>
			{screens.length > 0 && (
				<Grid.Dropdown.Section title="Screens">
					{screens.map((s, idx) => (
						<Grid.Dropdown.Item
							key={screenResolutions[idx]}
							title={`${s.name ?? `Screen ${idx}`} (${screenResolutions[idx]})`}
							value={screenResolutions[idx]}
						/>
					))}
				</Grid.Dropdown.Section>
			)}
			<Grid.Dropdown.Section title="Minimum resolution">
				{commonResolutions
					.filter((r) => !screenResolutions.includes(r.id))
					.map((r) => (
						<Grid.Dropdown.Item
							key={r.id}
							title={`${r.id} (${r.alias})`}
							value={r.id}
						/>
					))}
			</Grid.Dropdown.Section>
			<Grid.Dropdown.Section title="Aspect ratio">
				{commonRatios.map((r) => (
					<Grid.Dropdown.Item key={r.id} title={r.title} value={r.id} />
				))}
			</Grid.Dropdown.Section>
		</Grid.Dropdown>
	);
}

function WallpaperActions({ wallpaper }: { wallpaper: WallpaperResult }) {
	return (
		<ActionPanel>
			<Action
				title="Download and set as wallpaper"
				icon={Icon.Download}
				onAction={() => downloadAndSetWallpaper(wallpaper)}
			/>
			<ActionPanel.Section>
				<Action.OpenInBrowser
					title="Open on Wallhaven"
					icon={Icon.Link}
					url={wallpaper.url}
					shortcut={"open"}
				/>
				<Action.CopyToClipboard
					title="Copy wallpaper URL"
					content={wallpaper.path}
					shortcut={"copy"}
				/>
				<Action.CopyToClipboard
					title="Copy wallpaper ID"
					content={wallpaper.id}
				/>
				<Action.Push
					title="Preview wallpaper"
					icon={Icon.Eye}
					target={<Detail markdown={`![](${wallpaper.path})`} />}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);
}

export default function SearchWallpapers() {
	const [query, setQuery] = useState("");
	const [storedFilter, setStoredFilter] = useStoredFilter();
	const screens = useScreens();

	const defaultScreen = screens?.find((s) => s.active) ?? screens?.[0];
	const filterValue =
		storedFilter ??
		(storedFilter !== undefined && screens
			? defaultScreen
				? formatResolution(defaultScreen.physicalResolution)
				: DEFAULT_FILTER
			: undefined);

	const { wallpapers, isLoading, hasMore, loadMore } = useWallpaperSearch(
		query,
		filterValue,
	);

	const handleFilterChange = (value: string) => {
		if (value !== filterValue) setStoredFilter(value);
	};

	const ratio = useMemo((): [number, number] => {
		if (!filterValue) return [16, 9];

		const [w, h] = filterRatio(parseFilter(filterValue));

		// 43/18 is the exact ratio of "21/9" monitors
		if (w === 43 && h === 18) return [21, 9];

		return [w, h];
	}, [filterValue]);

	const columns = ratio[0] / ratio[1] > 2 ? 2 : 4;

	return (
		<Grid
			isLoading={isLoading}
			searchBarPlaceholder="Search wallpapers..."
			onSearchTextChange={setQuery}
			searchBarAccessory={
				filterValue && (
					<FilterDropdown
						screens={screens ?? []}
						value={filterValue}
						onChange={handleFilterChange}
					/>
				)
			}
			pagination={{ onLoadMore: loadMore, hasMore }}
			throttle
			fit={Grid.Fit.Fill}
		>
			<Grid.Section
				aspectRatio={ratio.join("/") as Grid.AspectRatio}
				title="Wallpapers"
				columns={columns}
			>
				{wallpapers.map((w) => (
					<Grid.Item
						key={w.id}
						title={w.resolution}
						content={{ source: w.thumbs.original }}
						actions={<WallpaperActions wallpaper={w} />}
					/>
				))}
			</Grid.Section>
		</Grid>
	);
}
