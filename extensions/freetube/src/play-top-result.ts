import { type LaunchProps, showToast, Toast } from "@vicinae/api";
import { openInFreeTube } from "./freetube";
import { searchUrl, watchUrl } from "./youtube";

const REQUEST_TIMEOUT_MS = 10_000;
const HUD_TITLE_MAX_LENGTH = 50;

// Search results are embedded in the page as one big `ytInitialData` JSON blob.
// Parsing it properly would mean extracting and parsing megabytes of JSON, so
// we scan for the first `videoRenderer` — the first genuine video result,
// skipping ads and shelf headers.
const FIRST_VIDEO_ID = /"videoRenderer":\{"videoId":"([\w-]{11})"/;
const TITLE_AFTER_VIDEO_ID = /"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/;
/** How far past the video ID the matching title can reasonably sit. */
const TITLE_SEARCH_WINDOW = 2000;

type TopResult = {
	videoId: string;
	/** Null when the page layout changed and no title could be read. */
	title: string | null;
};

export default async function PlayTopResult(
	props: LaunchProps<{ arguments: Arguments.PlayTopResult }>,
) {
	const query = props.arguments.query?.trim() ?? "";

	if (!query) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Empty query",
			message: "Please enter a search term",
		});
		return;
	}

	const toast = await showToast({
		style: Toast.Style.Animated,
		title: "Searching…",
		message: query,
	});

	let html: string;
	try {
		html = await fetchSearchResults(query);
	} catch (error) {
		toast.style = Toast.Style.Failure;
		toast.title = "Request failed";
		toast.message =
			error instanceof Error ? error.message : "Could not reach YouTube";
		return;
	}

	const top = findTopVideo(html);
	if (!top) {
		toast.style = Toast.Style.Failure;
		toast.title = "No results";
		toast.message = `Nothing found for "${query}"`;
		return;
	}

	const label = top.title
		? `Playing: ${truncateMiddle(top.title, HUD_TITLE_MAX_LENGTH)}`
		: "Playing top result in FreeTube";

	await openInFreeTube(watchUrl(top.videoId), label);
}

async function fetchSearchResults(query: string): Promise<string> {
	const response = await fetch(`${searchUrl(query)}&hl=en`, {
		headers: {
			// YouTube serves a stripped-down page to unrecognised clients.
			"User-Agent":
				"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept-Language": "en-US,en;q=0.9",
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`YouTube responded with ${response.status}`);
	}
	return response.text();
}

function findTopVideo(html: string): TopResult | null {
	const idMatch = FIRST_VIDEO_ID.exec(html);
	if (!idMatch) return null;

	// The first title following the ID belongs to that same result.
	const titleMatch = TITLE_AFTER_VIDEO_ID.exec(
		html.slice(idMatch.index, idMatch.index + TITLE_SEARCH_WINDOW),
	);

	return {
		videoId: idMatch[1],
		title: titleMatch ? decodeJsonString(titleMatch[1]) : null,
	};
}

/** Titles come out of the JSON blob still escaped (`\u0026`, `\"`, …). */
function decodeJsonString(escaped: string): string | null {
	try {
		return JSON.parse(`"${escaped}"`);
	} catch {
		return null;
	}
}

function truncateMiddle(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	const side = Math.floor((maxLength - 1) / 2);
	return `${text.slice(0, side)}…${text.slice(text.length - side)}`;
}
