import { Icon } from "@vicinae/api";
import type { LikeStatus, PlaybackState, RepeatMode } from "./kaset";

export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const total = Math.floor(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	const pad = (n: number) => n.toString().padStart(2, "0");
	return hours > 0
		? `${hours}:${pad(minutes)}:${pad(secs)}`
		: `${minutes}:${pad(secs)}`;
}

export function progressBar(
	position: number,
	duration: number,
	width = 28,
): string {
	const ratio =
		duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
	const filled = Math.round(ratio * width);
	return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

/**
 * Ask for a sensibly sized artwork.
 *
 * Kaset hands out googleusercontent URLs that carry their dimensions in the path
 * (`…=w544-h544-l90-rj`), so we rewrite that rather than scaling a large image
 * down after the fact. The query hint is Vicinae's own: its markdown renderer
 * reads `omnicast-width`/`omnicast-height` off the URL (`markdown-model.cpp`).
 */
export function artworkUrl(url: string, size: number): string | undefined {
	if (!url) return undefined;
	const resized = url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
	const separator = resized.includes("?") ? "&" : "?";
	return `${resized}${separator}omnicast-width=${size}&omnicast-height=${size}`;
}

export function volumeIcon(volume: number, muted = false): Icon {
	if (muted || volume === 0) return Icon.SpeakerOff;
	if (volume < 34) return Icon.SpeakerLow;
	if (volume < 67) return Icon.SpeakerOn;
	return Icon.SpeakerHigh;
}

export function playbackLabel(state: PlaybackState): string {
	return state === "playing"
		? "Playing"
		: state === "paused"
			? "Paused"
			: "Stopped";
}

export function repeatLabel(mode: RepeatMode): string {
	return mode === "all" ? "All" : mode === "one" ? "One" : "Off";
}

export function likeLabel(status: LikeStatus): string {
	return status === "liked"
		? "Liked"
		: status === "disliked"
			? "Disliked"
			: "Not rated";
}

/** The mode `cycle repeat` will land on next, used only for labelling an action. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
	return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}

const BARE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const PATH_ID = /\/(?:shorts|embed|v|live)\/([A-Za-z0-9_-]{6,20})/;

/**
 * Pull a video ID out of whatever the user pasted: a bare ID, a youtube.com or
 * music.youtube.com watch link, a youtu.be short link, or a /shorts, /embed or
 * /live URL.
 */
export function extractVideoId(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (BARE_ID.test(trimmed)) return trimmed;

	let url: URL;
	try {
		url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
	} catch {
		return null;
	}

	const fromQuery = url.searchParams.get("v");
	if (fromQuery && BARE_ID.test(fromQuery)) return fromQuery;

	const fromPath = url.pathname.match(PATH_ID);
	if (fromPath) return fromPath[1];

	if (url.hostname.endsWith("youtu.be")) {
		const candidate = url.pathname.replace(/^\//, "");
		if (BARE_ID.test(candidate)) return candidate;
	}

	return null;
}
