import { LocalStorage } from "@vicinae/api";
import {
	isYouTubeKind,
	KIND_LABELS,
	resolveYouTubeInput,
	type YouTubeKind,
	type YouTubeTarget,
} from "./youtube";

export type Bookmark = {
	id: string;
	name: string;
	url: string;
	kind: YouTubeKind;
	createdAt: number;
};

const STORAGE_KEY = "freetube_bookmarks";

/**
 * Bookmarks, newest first. Individually unreadable entries are skipped.
 *
 * A failing read is deliberately allowed to throw: `saveBookmark` reads before
 * it writes, so treating a storage error as "no bookmarks" would overwrite the
 * whole collection with a single entry.
 */
export async function listBookmarks(): Promise<Bookmark[]> {
	const stored = await LocalStorage.getItem<string>(STORAGE_KEY);
	if (!stored) return [];

	try {
		const parsed: unknown = JSON.parse(stored);
		return Array.isArray(parsed) ? parsed.filter(isBookmark) : [];
	} catch {
		return [];
	}
}

/**
 * Saves a bookmark, replacing any existing one pointing at the same video,
 * channel or playlist. Returns null when the input isn't a YouTube reference.
 */
export async function saveBookmark(
	input: string,
	name?: string,
): Promise<Bookmark | null> {
	const target = resolveYouTubeInput(input);
	if (!target) return null;

	const bookmarks = await listBookmarks();
	const existing = bookmarks.find((bookmark) => bookmark.url === target.url);

	const bookmark: Bookmark = {
		id: existing?.id ?? crypto.randomUUID(),
		name: name?.trim() || existing?.name || defaultBookmarkName(target),
		url: target.url,
		kind: target.kind,
		createdAt: existing?.createdAt ?? Date.now(),
	};

	await persist([
		bookmark,
		...bookmarks.filter((other) => other.id !== bookmark.id),
	]);
	return bookmark;
}

export async function removeBookmark(id: string): Promise<void> {
	const bookmarks = await listBookmarks();
	await persist(bookmarks.filter((bookmark) => bookmark.id !== id));
}

async function persist(bookmarks: Bookmark[]): Promise<void> {
	await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

function defaultBookmarkName(target: YouTubeTarget): string {
	const url = new URL(target.url);
	const identifier =
		url.searchParams.get("v") ??
		url.searchParams.get("list") ??
		url.pathname.split("/").filter(Boolean).pop();

	const label = KIND_LABELS[target.kind];
	return identifier ? `${label} (${identifier})` : label;
}

function isBookmark(value: unknown): value is Bookmark {
	if (typeof value !== "object" || value === null) return false;

	const candidate = value as Record<keyof Bookmark, unknown>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.name === "string" &&
		typeof candidate.url === "string" &&
		typeof candidate.createdAt === "number" &&
		isYouTubeKind(candidate.kind)
	);
}
