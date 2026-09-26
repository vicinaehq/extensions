import { Cache } from "@vicinae/api";
import * as fsp from "node:fs/promises";
import { expandHome, safeAccess } from "./utils";
import * as path from "node:path";
import { useEffect, useState } from "react";

const browserIcons = {
	brave: "browsers/brave.svg",
	chromium: "browsers/chromium.svg",
	chrome: "browsers/chrome.svg",
	vivaldi: "browsers/vivaldi.svg",
} as const;

export type ChromiumBrowser = {
	id: string;
	name: string;
	path: string;
	realPath: string;
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

export type FlattenedBrowserBookmark = {
	id: string;
	browser: ChromiumBrowser;
	profile: string;
	bookmark: UrlBookmark;
	folder?: string;
	favorite: boolean;
};

const cache = new Cache();

const BOOKMARKS_CACHE_KEY = "flattened-bookmarks-v5";
const FAVORITES_CACHE_KEY = "favorites";

const CHROMIUM_BROWSER_CANDIDATES = [
  {
    id: "brave",
    name: "brave",
    icon: browserIcons.brave,
    paths: [
      "~/.config/BraveSoftware/Brave-Browser",
      "~/.var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser",
    ],
  },
  {
    id: "chrome",
    name: "chrome",
    icon: browserIcons.chrome,
    paths: [
      "~/.config/google-chrome",
      "~/.var/app/com.google.Chrome/config/google-chrome",
    ],
  },
  {
    id: "chromium",
    name: "chromium",
    icon: browserIcons.chromium,
    paths: [
      "~/.config/chromium",
      "~/.var/app/org.chromium.Chromium/config/chromium",
    ],
  },
  {
    id: "vivaldi",
    name: "vivaldi",
    icon: browserIcons.vivaldi,
    paths: [
      "~/.config/vivaldi",
      "~/.var/app/com.vivaldi.Vivaldi/config/vivaldi",
    ],
  },
] as const;

const isFlatpakPath = (p: string) =>
	p.includes(`${path.sep}.var${path.sep}app${path.sep}`);

const normalizePath = (p: string) => path.normalize(p);

const realPathOrSelf = async (p: string) => {
	try {
		return await fsp.realpath(p);
	} catch {
		return p;
	}
};

const browserPreferenceScore = (
	browser: Pick<ChromiumBrowser, "path" | "realPath">,
) => {
	let score = 0;

	// If the real location is Flatpak data, this is fundamentally a Flatpak profile.
	if (isFlatpakPath(browser.realPath)) score += 100;

	// Prefer the actual Flatpak path over a symlink pointing to it.
	if (isFlatpakPath(browser.path)) score += 50;

	// Prefer a non-symlink path over an alias.
	if (normalizePath(browser.path) === normalizePath(browser.realPath)) {
		score += 10;
	}

	return score;
};

const getProfilesFromBrowserPath = async (browserPath: string) => {
	const profileCandidates = new Set<string>();

	const localStatePath = path.join(browserPath, "Local State");

	if (await safeAccess(localStatePath, fsp.constants.R_OK)) {
		try {
			const localState = JSON.parse(await fsp.readFile(localStatePath, "utf8"));
			const infoCache = localState?.profile?.info_cache ?? {};

			for (const profileName of Object.keys(infoCache)) {
				profileCandidates.add(path.join(browserPath, profileName));
			}
		} catch {
			// Ignore malformed Local State files.
		}
	}

	// Common fallback.
	profileCandidates.add(path.join(browserPath, "Default"));

	// Also scan direct child directories. This catches Profile 1, Profile 2, etc.
	try {
		const entries = await fsp.readdir(browserPath, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const profilePath = path.join(browserPath, entry.name);
			const bookmarksPath = path.join(profilePath, "Bookmarks");

			if (await safeAccess(bookmarksPath, fsp.constants.R_OK)) {
				profileCandidates.add(profilePath);
			}
		}
	} catch {
		// Ignore unreadable browser directories.
	}

	const profiles: string[] = [];
	const seenRealProfiles = new Set<string>();

	for (const profile of profileCandidates) {
		const bookmarksPath = path.join(profile, "Bookmarks");

		if (!(await safeAccess(bookmarksPath, fsp.constants.R_OK))) {
			continue;
		}

		const realProfile = await realPathOrSelf(profile);

		if (seenRealProfiles.has(realProfile)) {
			continue;
		}

		seenRealProfiles.add(realProfile);
		profiles.push(profile);
	}

	return profiles;
};

const findChromiumBrowsersFresh = async (): Promise<ChromiumBrowser[]> => {
	const browsersByRealPath = new Map<string, ChromiumBrowser>();

	for (const candidate of CHROMIUM_BROWSER_CANDIDATES) {
		for (const rawBrowserPath of candidate.paths) {
			const browserPath = expandHome(rawBrowserPath);

			const profiles = await getProfilesFromBrowserPath(browserPath);

			if (!profiles.length) {
				continue;
			}

			const realBrowserPath = await realPathOrSelf(browserPath);
			const realIsFlatpak = isFlatpakPath(realBrowserPath);

			const browser: ChromiumBrowser = {
				id: realIsFlatpak ? `${candidate.id}-flatpak` : candidate.id,
				name: realIsFlatpak
					? `${candidate.name} flatpak`
					: candidate.name,
				path: browserPath,
				realPath: realBrowserPath,
				profiles,
				icon: candidate.icon,
			};

			const existing = browsersByRealPath.get(realBrowserPath);

			if (
				!existing ||
				browserPreferenceScore(browser) > browserPreferenceScore(existing)
			) {
				browsersByRealPath.set(realBrowserPath, browser);
			}
		}
	}

	return Array.from(browsersByRealPath.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
};

const fromChromeTimestamp = (value?: string) => {
	if (!value || value === "0") return undefined;

  const CHROME_EPOCH_OFFSET = BigInt("11644473600000000");

  try {
		return new Date(
			Number((BigInt(String(value)) - CHROME_EPOCH_OFFSET) / BigInt(1000)),
		);
  } catch {
    return undefined;
  }
};

let favorites: Set<string> | null = null;

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
	await saveFavorites(f);
};

export const isFavoriteBookmark = (guid: string) => {
	return getFavorites().has(guid);
};

type BookmarkFileMetadata = {
	browserId: string;
	profile: string;
	path: string;
	realPath: string;
	size: number;
	mtimeMs: number;
};

type InternalBookmarkFileMetadata = BookmarkFileMetadata & {
	score: number;
};

const getBookmarkFilesMetadata = async (
	browsers: ChromiumBrowser[],
): Promise<BookmarkFileMetadata[]> => {
	const metasByRealPath = new Map<string, InternalBookmarkFileMetadata>();

	for (const browser of browsers) {
		for (const profile of browser.profiles) {
			const bookmarksPath = path.join(profile, "Bookmarks");

			try {
				const stat = await fsp.stat(bookmarksPath);
				const realBookmarksPath = await realPathOrSelf(bookmarksPath);

				const meta: InternalBookmarkFileMetadata = {
					browserId: browser.id,
					profile,
					path: bookmarksPath,
					realPath: realBookmarksPath,
					size: stat.size,
					mtimeMs: stat.mtimeMs,
					score: browserPreferenceScore(browser),
				};

				const existing = metasByRealPath.get(realBookmarksPath);

				if (!existing || meta.score > existing.score) {
					metasByRealPath.set(realBookmarksPath, meta);
				}
			} catch {
				// Ignore unreadable bookmark files.
			}
		}
	}

	return Array.from(metasByRealPath.values()).map(({ score: _, ...meta }) => meta);
};

const makeBookmarksSignature = (metas: BookmarkFileMetadata[]) => {
  return metas
		.map((m) => `${m.browserId}:${m.realPath}:${m.size}:${m.mtimeMs}`)
    .sort()
    .join("|");
};

type SerializedFlattenedBrowserBookmark = Omit<
  FlattenedBrowserBookmark,
  "bookmark"
> & {
  bookmark: Omit<UrlBookmark, "dateAdded" | "dateLastUsed"> & {
    dateAdded: string;
    dateLastUsed?: string;
  };
};

type CachedBookmarksPayload = {
	signature: string;
	bookmarks: SerializedFlattenedBrowserBookmark[];
};

const serializeBookmark = (
  b: FlattenedBrowserBookmark,
): SerializedFlattenedBrowserBookmark => ({
  ...b,
  bookmark: {
    ...b.bookmark,
    dateAdded: b.bookmark.dateAdded.toISOString(),
    dateLastUsed: b.bookmark.dateLastUsed?.toISOString(),
  },
});

const deserializeBookmark = (
  b: SerializedFlattenedBrowserBookmark,
): FlattenedBrowserBookmark => ({
  ...b,
  bookmark: {
    ...b.bookmark,
    dateAdded: new Date(b.bookmark.dateAdded),
    dateLastUsed: b.bookmark.dateLastUsed
      ? new Date(b.bookmark.dateLastUsed)
      : undefined,
  },
  favorite: isFavoriteBookmark(b.bookmark.id),
});

const sortBookmarks = (bookmarks: FlattenedBrowserBookmark[]) => {
	return [...bookmarks].sort((a, b) => {
		const favoriteDiff = Number(b.favorite) - Number(a.favorite);

		if (favoriteDiff !== 0) {
			return favoriteDiff;
		}

		return b.bookmark.dateAdded.getTime() - a.bookmark.dateAdded.getTime();
	});
};

const getCachedBookmarks = (
  signature: string,
): FlattenedBrowserBookmark[] | null => {
  try {
    const raw = cache.get(BOOKMARKS_CACHE_KEY);

		if (!raw) {return null;}

    const payload = JSON.parse(raw) as CachedBookmarksPayload;

		if (payload.signature !== signature) {return null;}

    return payload.bookmarks.map(deserializeBookmark);
  } catch {
    return null;
  }
};

const saveCachedBookmarks = (
  signature: string,
  bookmarks: FlattenedBrowserBookmark[],
) => {
  const payload: CachedBookmarksPayload = {
    signature,
    bookmarks: bookmarks.map(serializeBookmark),
  };

  cache.set(BOOKMARKS_CACHE_KEY, JSON.stringify(payload));
};

const parseBookmarkFileFlat = async ({
	browser,
	profile,
	bookmarksPath,
}: {
	browser: ChromiumBrowser;
	profile: string;
	bookmarksPath: string;
}): Promise<FlattenedBrowserBookmark[]> => {
	const data = JSON.parse(await fsp.readFile(bookmarksPath, "utf-8"));
	const result: FlattenedBrowserBookmark[] = [];

	const walk = (node: any, folder?: string) => {
		if (!node) return;

		if (node.type === "url" && node.url) {
			const bookmark: UrlBookmark = {
				id: node.guid,
				name: node.name || node.url,
				type: "url",
				url: node.url,
				dateAdded: fromChromeTimestamp(node.date_added) ?? new Date(0),
				dateLastUsed: fromChromeTimestamp(node.date_last_used),
			};

      result.push({
		id: `${browser.id}:${profile}:${bookmark.id}`,
        browser,
        profile,
        bookmark,
        folder,
        favorite: isFavoriteBookmark(bookmark.id),
      });

      return;
    }

    if (node.type === "folder" || Array.isArray(node.children)) {
			const nextFolder = node.name
				? folder
					? `${folder} / ${node.name}`
					: node.name
				: folder;

      for (const child of node.children ?? []) {
        walk(child, nextFolder);
      }
    }
  };

  for (const root of Object.values(data.roots ?? {})) {
    walk(root);
  }

  return result;
};

const getBookmarksFresh = async (
	browsers: ChromiumBrowser[],
	metas: BookmarkFileMetadata[],
) => { const browserById = new Map(browsers.map((browser) => [browser.id, browser]));

  const chunks = await Promise.all(
    metas.map(async (meta) => {
      const browser = browserById.get(meta.browserId);

			if (!browser) {
				return [];
			}

      return parseBookmarkFileFlat({
        browser,
        profile: meta.profile,
        bookmarksPath: meta.path,
      });
    }),
  );

  return chunks.flat();
};

export const useChromiumBrowsers = () => {
	const [browsers, setBrowsers] = useState<ChromiumBrowser[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;

		setLoading(true);

		findChromiumBrowsersFresh()
			.then((freshBrowsers) => {
				if (!cancelled) {
					setBrowsers(freshBrowsers);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setError(err);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return { browsers, loading, error };
};

export const useBookmarks = () => {
  const {
    browsers,
    loading: browsersLoading,
    error: browserError,
  } = useChromiumBrowsers();

  const [bookmarks, setBookmarks] = useState<FlattenedBrowserBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (browsersLoading) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      try {
        const metas = await getBookmarkFilesMetadata(browsers);
        const signature = makeBookmarksSignature(metas);

        const cached = getCachedBookmarks(signature);

        if (cached) {
			if (!cancelled) {setBookmarks(sortBookmarks(cached));}
          	return;
        }

        const fresh = await getBookmarksFresh(browsers, metas);
				const sorted = sortBookmarks(fresh);

				saveCachedBookmarks(signature, sorted);

				if (!cancelled) {setBookmarks(sorted);}
      } catch (err) {
				if (!cancelled) {setError(err as Error);}
      } finally {
				if (!cancelled) {setLoading(false);}
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [browsers, browsersLoading]);

  return {
    bookmarks,
    browsers,
    error: browserError ?? error ?? null,
    loading: loading || browsersLoading,
  };
};
