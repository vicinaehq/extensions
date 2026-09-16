import { KasetError, NOT_RUNNING, quote, runAppleScript } from "./applescript";

const KASET_APP = "Kaset";

export type PlaybackState = "playing" | "paused" | "stopped";
export type RepeatMode = "off" | "all" | "one";
export type LikeStatus = "liked" | "disliked" | "none";

export type Track = {
	name: string;
	artist: string;
	album: string;
	duration: number;
	videoId: string;
	artworkUrl: string;
};

export type PlayerInfo = {
	state: PlaybackState;
	position: number;
	duration: number;
	volume: number;
	muted: boolean;
	shuffling: boolean;
	repeating: RepeatMode;
	likeStatus: LikeStatus;
	track: Track | null;
};

export type QueueTrack = Track & {
	/** 1-based, as expected by `play track at index`. */
	index: number;
};

export type PlayQueue = {
	/** 1-based index of the active track, or 0 when the queue is empty. */
	currentIndex: number;
	tracks: QueueTrack[];
};

/**
 * The AppleScript statement for each mutation, plus whether Kaset applies it
 * synchronously.
 *
 * Kaset's `ScriptCommands.swift` splits into two groups: the commands that mutate
 * inside `MainActor.assumeIsolated` have already taken effect when the Apple event
 * returns, while the ones that dispatch to `Task { @MainActor }` have not. Only the
 * latter need a settling delay before we can read the resulting state back.
 */
const MUTATIONS = {
	play: { statement: "play", sync: false },
	pause: { statement: "pause", sync: false },
	playPause: { statement: "playpause", sync: false },
	nextTrack: { statement: "next track", sync: false },
	previousTrack: { statement: "previous track", sync: false },
	toggleMute: { statement: "toggle mute", sync: false },
	setVolume: { statement: "set volume", sync: false },
	playVideo: { statement: "play video", sync: false },
	playTrackAtIndex: { statement: "play track at index", sync: false },
	toggleShuffle: { statement: "toggle shuffle", sync: true },
	cycleRepeat: { statement: "cycle repeat", sync: true },
	likeTrack: { statement: "like track", sync: true },
	dislikeTrack: { statement: "dislike track", sync: true },
} as const;

export type MutationName = keyof typeof MUTATIONS;

/** Seconds to wait before reading back state that Kaset applies asynchronously. */
const SETTLE_SECONDS = 0.3;

function guard(body: string[]): string[] {
	return [
		`if application ${quote(KASET_APP)} is running then`,
		...body.map((line) => `\t${line}`),
		"else",
		`\t${quote(NOT_RUNNING)}`,
		"end if",
	];
}

function assertRunning(result: string): string {
	if (result === NOT_RUNNING) {
		throw new KasetError("not-running", "Kaset is not running.");
	}
	return result;
}

function parseJson(raw: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new KasetError(
			"unknown",
			"Kaset returned a response we could not read.",
			raw,
		);
	}

	if (typeof parsed !== "object" || parsed === null) {
		throw new KasetError(
			"unknown",
			"Kaset returned a response we could not read.",
			raw,
		);
	}

	const record = parsed as Record<string, unknown>;
	// Kaset answers `{"error": "Player not available"}` when its PlayerService is nil.
	if (typeof record.error === "string") {
		throw new KasetError(
			"not-ready",
			"Kaset is still starting up. Give it a moment and try again.",
		);
	}

	return record;
}

function num(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function toTrack(value: unknown): Track | null {
	if (typeof value !== "object" || value === null) return null;
	const raw = value as Record<string, unknown>;

	return {
		name: str(raw.name, "Unknown Track"),
		artist: str(raw.artist, "Unknown Artist"),
		album: str(raw.album),
		duration: num(raw.duration),
		videoId: str(raw.videoId),
		artworkUrl: str(raw.artworkURL),
	};
}

function toPlayerInfo(raw: Record<string, unknown>): PlayerInfo {
	const isPlaying = raw.isPlaying === true;
	const isPaused = raw.isPaused === true;
	const repeating = str(raw.repeating, "off");
	const likeStatus = str(raw.likeStatus, "none");

	return {
		state: isPlaying ? "playing" : isPaused ? "paused" : "stopped",
		position: num(raw.position),
		duration: num(raw.duration),
		volume: Math.max(0, Math.min(100, Math.round(num(raw.volume)))),
		muted: raw.muted === true,
		shuffling: raw.shuffling === true,
		repeating: repeating === "all" || repeating === "one" ? repeating : "off",
		likeStatus:
			likeStatus === "liked" || likeStatus === "disliked" ? likeStatus : "none",
		track: toTrack(raw.currentTrack),
	};
}

async function isRunning(): Promise<boolean> {
	const result = await runAppleScript(
		[`application ${quote(KASET_APP)} is running`],
		{
			timeoutMs: 2_000,
		},
	);
	return result === "true";
}

/** Launch Kaset, or bring it forward if it is already up. */
export async function launch(): Promise<void> {
	try {
		await runAppleScript([`tell application ${quote(KASET_APP)} to activate`], {
			timeoutMs: 10_000,
		});
	} catch (error) {
		// `activate` on a name macOS cannot resolve fails with -1728, the same code
		// Kaset uses for "player not initialized". Here it can only mean the app is
		// not installed, so do not let it read as a transient startup hiccup.
		if (error instanceof KasetError && error.kind === "not-ready") {
			throw new KasetError(
				"not-installed",
				"Kaset does not seem to be installed.",
				error.detail,
			);
		}
		throw error;
	}
}

export async function getPlayerInfo(): Promise<PlayerInfo> {
	const raw = await runAppleScript(
		guard([`tell application ${quote(KASET_APP)} to get player info`]),
	);
	return toPlayerInfo(parseJson(assertRunning(raw)));
}

export async function getPlayQueue(): Promise<PlayQueue> {
	const raw = await runAppleScript(
		guard([`tell application ${quote(KASET_APP)} to get play queue`]),
	);
	const parsed = parseJson(assertRunning(raw));
	const currentIndex = num(parsed.currentIndex);
	const entries = Array.isArray(parsed.tracks) ? parsed.tracks : [];

	const tracks = entries.flatMap((entry, position): QueueTrack[] => {
		const track = toTrack(entry);
		if (!track) return [];
		return [{ ...track, index: position + 1 }];
	});

	return { currentIndex, tracks };
}

type MutationOptions = {
	/** Direct parameter, already formatted as an AppleScript literal. */
	argument?: string;
	timeoutMs?: number;
};

/**
 * Run one mutation and, optionally, read the resulting player state back in the
 * same `osascript` invocation.
 *
 * Doing both in one script keeps every action at a single process, and means the
 * feedback we show is the state Kaset actually ended up in rather than a guess
 * extrapolated from a stale read.
 */
async function run(
	name: MutationName,
	options: MutationOptions,
	readBack: boolean,
): Promise<PlayerInfo | null> {
	const spec = MUTATIONS[name];
	const call =
		options.argument === undefined
			? spec.statement
			: `${spec.statement} ${options.argument}`;
	const body = [call];

	if (readBack) {
		if (!spec.sync) body.push(`delay ${SETTLE_SECONDS}`);
		body.push("get player info");
	}

	const script = guard([
		`tell application ${quote(KASET_APP)}`,
		...body.map((line) => `\t${line}`),
		"end tell",
		...(readBack ? [] : [quote("ok")]),
	]);

	const raw = assertRunning(
		await runAppleScript(script, { timeoutMs: options.timeoutMs }),
	);
	return readBack ? toPlayerInfo(parseJson(raw)) : null;
}

/** Fire a command without waiting for Kaset to settle. */
export async function mutate(
	name: MutationName,
	options: MutationOptions = {},
): Promise<void> {
	await run(name, options, false);
}

/** Fire a command and return the state Kaset actually ended up in. */
export async function mutateAndRead(
	name: MutationName,
	options: MutationOptions = {},
): Promise<PlayerInfo> {
	return (await run(name, options, true)) as PlayerInfo;
}

export function clampVolume(volume: number): number {
	return Math.max(0, Math.min(100, Math.round(volume)));
}

export const setVolumeAndRead = (volume: number) =>
	mutateAndRead("setVolume", { argument: String(clampVolume(volume)) });

export const playVideo = (videoId: string) =>
	mutate("playVideo", { argument: quote(videoId) });

export const playTrackAtIndex = (index: number) =>
	mutate("playTrackAtIndex", {
		argument: String(Math.max(1, Math.round(index))),
	});

/**
 * Skip to another track and wait until Kaset reports a different one.
 *
 * `next track` and `previous track` are dispatched asynchronously and the new
 * metadata lands a moment after that, so any fixed delay would regularly report
 * the track we just left. Polling until the video ID actually changes reports the
 * truth, and falls back to whatever Kaset has once the deadline passes.
 */
export async function changeTrack(
	name: "nextTrack" | "previousTrack",
	timeoutMs = 3_000,
): Promise<PlayerInfo> {
	let before: string | null = null;
	try {
		before = (await getPlayerInfo()).track?.videoId ?? null;
	} catch {
		// No readable state beforehand just means we cannot detect the change; the
		// command below is still worth running.
	}

	await mutate(name);

	const deadline = Date.now() + timeoutMs;
	let latest = await getPlayerInfo();
	while (Date.now() < deadline && (latest.track?.videoId ?? null) === before) {
		await new Promise((resolve) => setTimeout(resolve, 200));
		latest = await getPlayerInfo();
	}

	return latest;
}

/**
 * Make sure Kaset is running and its player is initialised.
 *
 * Kaset answers commands with error -1728 for a short while after launch, so a
 * cold start needs more than "is the process there?" before we send anything.
 */
export async function ensureReady(timeoutMs = 10_000): Promise<void> {
	if (!(await isRunning())) await launch();

	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			await getPlayerInfo();
			return;
		} catch (error) {
			const kind = error instanceof KasetError ? error.kind : "unknown";
			const retryable =
				kind === "not-ready" || kind === "not-running" || kind === "timeout";
			if (!retryable || Date.now() >= deadline) throw error;
			await new Promise((resolve) => setTimeout(resolve, 400));
		}
	}
}
