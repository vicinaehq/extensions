/**
 * Recognising YouTube input and turning it into a canonical URL.
 *
 * Every command funnels user input through `resolveYouTubeInput` so that a
 * link pasted into Open behaves exactly like the same link saved as a
 * bookmark.
 */

export type YouTubeKind = "video" | "channel" | "playlist" | "other";

export type YouTubeTarget = {
	kind: YouTubeKind;
	/** Canonical `https://www.youtube.com/…` URL. */
	url: string;
};

export const KIND_LABELS: Record<YouTubeKind, string> = {
	video: "Video",
	channel: "Channel",
	playlist: "Playlist",
	other: "Link",
};

const KINDS = Object.keys(KIND_LABELS) as YouTubeKind[];

export function isYouTubeKind(value: unknown): value is YouTubeKind {
	return typeof value === "string" && KINDS.includes(value as YouTubeKind);
}

const BARE_VIDEO_ID = /^[\w-]{11}$/;
const BARE_CHANNEL_ID = /^UC[\w-]{22}$/;
const BARE_HANDLE = /^@[\w.-]{3,30}$/;
// Playlist IDs carry a prefix describing their origin: regular playlists (PL),
// user uploads (UU), likes (LL), favourites (FL), mixes (RD), auto-generated
// music albums (OLAK5uy_, matched by OL) and legacy course lists (EC).
const BARE_PLAYLIST_ID = /^(?:PL|OL|UU|LL|FL|RD|EC)[\w-]{10,}$/;

const VIDEO_PATH_PREFIXES = ["/shorts/", "/embed/", "/live/", "/v/"];
const CHANNEL_PATH_PREFIXES = ["/channel/", "/c/", "/user/", "/@"];

/** Watch parameters worth keeping; anything else is tracking noise. */
const KEPT_WATCH_PARAMS = ["list", "index", "t"];

export function watchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`;
}

export function playlistUrl(playlistId: string): string {
	return `https://www.youtube.com/playlist?list=${playlistId}`;
}

export function searchUrl(query: string): string {
	return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/**
 * Resolves anything a user might paste — a URL, a bare ID, an `@handle`, even
 * a `freetube://` link copied back out of the app.
 */
export function resolveYouTubeInput(raw: string): YouTubeTarget | null {
	const input = raw.trim().replace(/^freetube:\/\//i, "");
	if (!input) return null;

	const bare = resolveBareIdentifier(input);
	if (bare) return bare;

	// Accept `youtube.com/…` and `youtu.be/…` without a scheme.
	const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
		? input
		: `https://${input}`;

	return classifyYouTubeUrl(absolute);
}

function resolveBareIdentifier(input: string): YouTubeTarget | null {
	// Anything with a slash or a scheme is a URL, not an identifier.
	if (input.includes("/") || input.includes(":")) return null;

	if (BARE_HANDLE.test(input)) {
		return { kind: "channel", url: `https://www.youtube.com/${input}` };
	}
	if (BARE_CHANNEL_ID.test(input)) {
		return { kind: "channel", url: `https://www.youtube.com/channel/${input}` };
	}
	if (BARE_PLAYLIST_ID.test(input)) {
		return { kind: "playlist", url: playlistUrl(input) };
	}
	if (BARE_VIDEO_ID.test(input)) {
		return { kind: "video", url: watchUrl(input) };
	}
	return null;
}

function classifyYouTubeUrl(raw: string): YouTubeTarget | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") return null;

	const host = url.hostname.replace(/^(?:www\.|m\.|music\.)/, "");

	if (host === "youtu.be") {
		return asVideo(url.pathname.slice(1), url);
	}
	if (host !== "youtube.com") return null;

	const path = url.pathname;

	if (path === "/watch") {
		return asVideo(url.searchParams.get("v") ?? "", url);
	}

	const videoPrefix = VIDEO_PATH_PREFIXES.find((prefix) =>
		path.startsWith(prefix),
	);
	if (videoPrefix) {
		return asVideo(path.slice(videoPrefix.length).split("/")[0], url);
	}

	if (CHANNEL_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
		// Drop the query string but keep sub-pages such as `/@handle/videos`.
		return { kind: "channel", url: `https://www.youtube.com${path}` };
	}

	if (path === "/playlist") {
		const list = url.searchParams.get("list");
		return list ? { kind: "playlist", url: playlistUrl(list) } : null;
	}

	// A YouTube URL we don't specifically understand: FreeTube may still know
	// what to do with it, so pass it through untouched.
	return { kind: "other", url: url.toString() };
}

/**
 * Rebuilds a watch URL from scratch so that shorts, embeds, `youtu.be` links
 * and share links with tracking parameters all collapse to the same string.
 */
function asVideo(videoId: string, source: URL): YouTubeTarget | null {
	if (!BARE_VIDEO_ID.test(videoId)) return null;

	const canonical = new URL(watchUrl(videoId));
	for (const param of KEPT_WATCH_PARAMS) {
		const value = source.searchParams.get(param);
		if (value) canonical.searchParams.set(param, value);
	}
	return { kind: "video", url: canonical.toString() };
}
