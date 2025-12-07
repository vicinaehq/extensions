import { Cache } from "@vicinae/api";
import * as fsp from "node:fs/promises";
import { configHome, safeAccess } from "./utils";
import { homedir } from "node:os";
import * as path from "node:path";
import { useEffect, useState } from "react";

const browserIcons = {
	brave: "browsers/brave.svg",
	chromium: "browsers/chromium.svg",
	chrome: "browsers/chrome.svg",
	vivaldi: "browsers/vivaldi.svg",
} as const;

export type ChromiumBrowser = {
	name: string;
	path: string;
	profiles: string[];
	icon: string;
};

type BookmarkBase = {
	id: string;
	name: string;
	dateAdded: Date;
	dateLastUsed?: Date;
};

export type UrlBookmark = BookmarkBase & {
	type: "url";
	url: string;
};

export type FolderBookmark = BookmarkBase & {
	type: "folder";
	children: Bookmark[];
};

export type Bookmark = UrlBookmark | FolderBookmark;

const findBrowserProfiles = async (browser: string) => {
	const localState = JSON.parse(
		await fsp.readFile(path.join(browser, "Local State"), "utf8"),
	);

	return Object.keys(localState.profile.info_cache).map((p) =>
		path.join(browser, p),
	);
};

const guessBrowserIcon = (name: string) => {
	if (name.includes("vivaldi")) return browserIcons.vivaldi;
	if (name.includes("brave")) return browserIcons.brave;
	if (name.includes("chrome")) return browserIcons.chrome;
	return browserIcons.chromium;
};

const BROWSERS_CACHE_KEY = "browsers";
const cache = new Cache();

const findChromiumBrowsers = async (config: string) => {
	// TODO: implement caching

	const maxDepth = 2;
	const paths = [{ path: config, depth: 1 }];
	const browsers = [] as ChromiumBrowser[];

	while (paths.length) {
		const { path: dir, depth } = paths.pop()!;

		try {
			const entries = await fsp.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const fullPath = path.join(entry.parentPath, entry.name);
				const bkPath = path.join(fullPath, "Default");
				const access = await safeAccess(bkPath, fsp.constants.R_OK);

				if (!access) {
					if (depth < maxDepth) {
						paths.push({ path: fullPath, depth: depth + 1 });
					}
					continue;
				}

				const name = entry.name.toLowerCase();
				const profiles = await findBrowserProfiles(fullPath);

				browsers.push({
					name,
					path: fullPath,
					profiles,
					icon: guessBrowserIcon(name),
				});
			}
		} catch (_) { }
	}

	cache.set(BROWSERS_CACHE_KEY, JSON.stringify(browsers));

	return browsers;
};

const fromChromeTimestamp = (s: string) => {
	const CHROME_EPOCH_OFFSET = BigInt("11644473600000000");
	return new Date(Number((BigInt(s) - CHROME_EPOCH_OFFSET) / BigInt(1000)));
};

const parseBookmarkFile = async (path: string): Promise<Bookmark[]> => {
	const data = JSON.parse(await fsp.readFile(path, "utf-8"));
	const parseBookmark = (data: any): Bookmark => {
		return {
			id: data.guid,
			name: data.name,
			type: data.type,
			url: data.url,
			dateAdded: fromChromeTimestamp(data.date_added),
			dateLastUsed:
				data.date_last_used !== "0"
					? fromChromeTimestamp(data.date_last_used)
					: undefined,
			children: data.children?.map(parseBookmark) ?? [],
		};
	};

	return Object.values(data.roots ?? []).map(parseBookmark);
};

type ProfileBookmarks = {
	profile: string;
	bookmarks: Bookmark[];
};

type BrowserBookmarks = {
	browser: ChromiumBrowser;
	profiles: ProfileBookmarks[];
};

const getBrowserBookmarks = async (
	browser: ChromiumBrowser,
): Promise<ProfileBookmarks[]> => {
	const roots: ProfileBookmarks[] = [];

	for (const profile of browser.profiles) {
		const bk = path.join(profile, "Bookmarks");
		if (await safeAccess(bk, fsp.constants.R_OK)) {
			const bookmarks = await parseBookmarkFile(bk);
			roots.push({ profile, bookmarks });
		}
	}

	return roots;
};

const getBookmarks = async (browsers: ChromiumBrowser[]) => {
	const pp = await Promise.all(
		browsers.map(async (browser) => {
			const profiles = await getBrowserBookmarks(browser);
			return { browser, profiles };
		}),
	);

	return pp;
};

export const useChromiumBrowsers = () => {
	const [browsers, setBrowsers] = useState<ChromiumBrowser[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		setLoading(true);
		findChromiumBrowsers(configHome())
			.then(setBrowsers)
			.catch(setError)
			.finally(() => setLoading(false));
	}, []);

	return { browsers, loading, error };
};

export const useBookmarks = () => {
	const {
		browsers,
		loading: browsersLoading,
		error: browserError,
	} = useChromiumBrowsers();
	const [roots, setRoots] = useState<BrowserBookmarks[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (browsersLoading) return;
		setLoading(true);
		getBookmarks(browsers)
			.then(setRoots)
			.catch(setError)
			.finally(() => setLoading(false));
	}, [browsers]);

	return {
		roots,
		browsers,
		error: browserError ?? error ?? null,
		loading: loading || browsersLoading,
	};
};

export type FlattenedBrowserBookmark = {
	id: string;
	browser: ChromiumBrowser;
	bookmark: UrlBookmark;
	folder?: string; // for now, only one level of nesting is supported.
	favorite: boolean; // implemented on the vicinae layer, not browser
};

let favorites: Set<string> | null = null;

const FAVORITES_CACHE_KEY = "favorites";

const getFavorites = () => {
	if (!favorites) {
		const set = new Set<string>(
			JSON.parse(cache.get(FAVORITES_CACHE_KEY) ?? "[]"),
		);
		favorites = set;
		return set;
	}
	return favorites;
};

const saveFavorites = async (favorites: Set<string>) => {
	cache.set(FAVORITES_CACHE_KEY, JSON.stringify(Array.from(favorites)));
};

export const addFavorite = async (guid: string) => {
	const f = getFavorites();
	f.add(guid);
	await saveFavorites(f);
};

export const removeFavorite = async (guid: string) => {
	const f = getFavorites();
	f.delete(guid);
	saveFavorites(f);
};

export const isFavoriteBookmark = (guid: string) => {
	return getFavorites().has(guid);
};

export const flattenBookmarks = (
	roots: BrowserBookmarks[],
): FlattenedBrowserBookmark[] => {
	const flattenBookmark = (
		bookmark: Bookmark,
		arr: FlattenedBrowserBookmark[],
		browser: ChromiumBrowser,
		folder?: string,
	) => {
		if (bookmark.type === "url") {
			arr.push({
				id: `${browser.name}-${bookmark.id}`,
				browser,
				bookmark,
				folder,
				favorite: isFavoriteBookmark(bookmark.id),
			});
		} else if (bookmark.type === "folder") {
			for (const b of bookmark.children) {
				flattenBookmark(b, arr, browser, bookmark.name);
			}
		}
	};

	return roots.flatMap((root) =>
		root.profiles.flatMap((p) => {
			const bks = [] as FlattenedBrowserBookmark[];
			for (const b of p.bookmarks) {
				flattenBookmark(b, bks, root.browser);
			}
			return bks;
		}),
	);
};
