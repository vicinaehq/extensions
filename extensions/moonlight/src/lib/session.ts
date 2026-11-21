// Pure helpers for detecting running sessions. No Vicinae or Node I/O imports
// so the logic can be unit-tested with vitest.

import type { MoonlightApp, MoonlightHost } from "./parse";

export type ServerState = "free" | "busy" | "unknown";

export interface ServerInfo {
	state: ServerState;
	/** ID of the app currently running on the host (0 = nothing running). */
	currentGame: number;
}

function xmlTag(xml: string, tag: string): string | undefined {
	const match = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, "i").exec(xml);
	return match?.[1];
}

/**
 * Parse the XML returned by `GET http://<host>:47989/serverinfo`. Returns
 * undefined when the response is not a usable serverinfo document.
 */
export function parseServerInfo(xml: string): ServerInfo | undefined {
	if (!/<root[\s>]/i.test(xml)) return undefined;
	const status = /<root[^>]*\bstatus_code="(\d+)"/i.exec(xml)?.[1];
	if (status && status !== "200") return undefined;

	const rawGame = xmlTag(xml, "currentgame");
	const rawState = xmlTag(xml, "state");
	if (rawGame === undefined && rawState === undefined) return undefined;

	const parsedGame = Number.parseInt(rawGame ?? "0", 10);
	const currentGame = Number.isNaN(parsedGame) ? 0 : parsedGame;

	let state: ServerState = "unknown";
	if (rawState?.toUpperCase().endsWith("_SERVER_BUSY")) state = "busy";
	else if (rawState?.toUpperCase().endsWith("_SERVER_FREE")) state = "free";
	// GeForce Experience reports other state strings; fall back to currentgame.
	if (state === "unknown" && rawGame !== undefined) {
		state = currentGame > 0 ? "busy" : "free";
	}
	return { state, currentGame };
}

/** Build the serverinfo URL for a host from its Moonlight.conf entry. */
export function serverInfoUrl(host: MoonlightHost): string {
	const address = host.localAddress || host.manualAddress || host.name;
	const formatted =
		address.includes(":") && !address.startsWith("[")
			? `[${address}]`
			: address;
	const port = host.localPort && host.localPort > 0 ? host.localPort : 47989;
	return `http://${formatted}:${port}/serverinfo?uniqueid=0123456789ABCDEF`;
}

/** All identifiers a user may have passed to `moonlight stream` for this host. */
export function hostIdentifiers(host: MoonlightHost): string[] {
	return [host.name, host.localAddress, host.manualAddress, host.remoteAddress]
		.filter((v): v is string => Boolean(v))
		.map((v) => v.toLowerCase());
}

const MOONLIGHT_EXE = /^\.?moonlight(-qt)?(-wrapped)?$/i;

/**
 * Check whether a process command line (the NUL-separated contents of
 * /proc/<pid>/cmdline, already split into argv) is a `moonlight stream`
 * process for the given host.
 *
 * Limitation: a stream started from the Moonlight GUI runs inside the
 * argument-less main process, so it cannot be attributed to a host and is
 * not detected here. The host's serverinfo state still shows it as busy.
 */
export function isStreamProcessForHost(
	argv: string[],
	identifiers: string[],
): boolean {
	return localStreamTarget(argv, identifiers) !== undefined;
}

/** A local `moonlight stream` process for a host, with the app it streams. */
export interface LocalStream {
	/** App name from the command line (the argument after the host), if any. */
	appName?: string;
}

/**
 * Like {@link isStreamProcessForHost}, but also returns the streamed app's
 * name (the argument following the host). Returns undefined when the process
 * is not a stream for this host.
 */
export function localStreamTarget(
	argv: string[],
	identifiers: string[],
): LocalStream | undefined {
	const exe = argv[0]?.split("/").pop();
	if (!exe || !MOONLIGHT_EXE.test(exe)) return undefined;
	const streamIndex = argv.indexOf("stream", 1);
	if (streamIndex < 0) return undefined;
	const ids = new Set(identifiers.map((i) => i.toLowerCase()));
	for (let i = streamIndex + 1; i < argv.length; i++) {
		if (ids.has((argv[i] ?? "").toLowerCase())) {
			const next = argv[i + 1];
			return { appName: next && !next.startsWith("--") ? next : undefined };
		}
	}
	return undefined;
}

export interface ProcessEntry {
	pid: number;
	argv: string[];
}

/**
 * PIDs of local `moonlight stream` processes for the host, i.e. the ones to
 * send SIGTERM to when ending the session. Our own PID and invalid PIDs are
 * never selected.
 */
export function selectStreamPids(
	processes: ProcessEntry[],
	identifiers: string[],
	selfPid?: number,
): number[] {
	return processes
		.filter(
			(p) =>
				Number.isInteger(p.pid) &&
				p.pid > 1 &&
				p.pid !== selfPid &&
				localStreamTarget(p.argv, identifiers) !== undefined,
		)
		.map((p) => p.pid);
}

/** Split raw /proc/<pid>/cmdline contents into argv. */
export function splitCmdline(raw: string): string[] {
	return raw.split("\0").filter((part) => part !== "");
}

// ---- Presentation decisions -------------------------------------------------

/**
 * Apps to show for a host. Apps flagged hidden in Moonlight are omitted unless
 * `showHidden` is set; the app currently running on the host is always kept
 * so the running session stays visible.
 */
export function visibleApps(
	apps: MoonlightApp[],
	showHidden: boolean,
	runningAppId?: number,
): MoonlightApp[] {
	if (showHidden) return apps;
	return apps.filter((a) => !a.hidden || a.id === runningAppId);
}

export interface HostSession {
	/** ID of the app running on the host, if known. */
	runningAppId?: number;
	/** Name of the running app, if known. */
	runningAppName?: string;
	/** Whether this PC is streaming the host. */
	streamingHere: boolean;
	/** Whether the host is busy (running an app or streamed from this PC). */
	busy: boolean;
}

/**
 * Combine the serverinfo state and the local process scan into one view of
 * the host. serverinfo is authoritative for the running app; when it is
 * unknown, the app name from the local `moonlight stream` command line is
 * used instead.
 */
export function resolveHostSession(
	apps: MoonlightApp[],
	serverInfo: ServerInfo | undefined,
	localStream: LocalStream | undefined,
): HostSession {
	let runningAppId: number | undefined;
	if (serverInfo && serverInfo.state !== "free" && serverInfo.currentGame > 0) {
		runningAppId = serverInfo.currentGame;
	} else if (localStream?.appName) {
		const wanted = localStream.appName.toLowerCase();
		runningAppId = apps.find((a) => a.name.toLowerCase() === wanted)?.id;
	}
	const runningAppName =
		runningAppId !== undefined
			? (apps.find((a) => a.id === runningAppId)?.name ?? `app ${runningAppId}`)
			: localStream?.appName;
	const streamingHere = localStream !== undefined;
	return {
		runningAppId,
		runningAppName,
		streamingHere,
		busy: streamingHere || runningAppId !== undefined,
	};
}

/** One-line host status for the section subtitle, or undefined when free/unknown. */
export function hostStatusSummary(session: HostSession): string | undefined {
	if (session.streamingHere) {
		return session.runningAppName
			? `streaming ${session.runningAppName} on this PC`
			: "streaming on this PC";
	}
	if (session.busy) {
		return session.runningAppName
			? `busy · ${session.runningAppName} running`
			: "busy";
	}
	return undefined;
}

export type PrimaryAction =
	/** Start a new stream (host free or state unknown). */
	| "start"
	/** Resume the app running on the host (not streamed here). */
	| "resume"
	/** The app is already streamed by this PC: explain with a toast. */
	| "already-streaming"
	/** The host is busy with another app: explain with a toast. */
	| "host-busy";

export type StatusMarker = "streaming-here" | "running-on-host";

export interface AppPresentation {
	primary: PrimaryAction;
	/** Per-item status marker; only the running app gets one. */
	marker?: StatusMarker;
	/** Render as unavailable (muted icon, no start as primary action). */
	disabled: boolean;
	/** Offer "Quit Running App & Start" as a secondary action. */
	offerQuitAndStart: boolean;
}

/**
 * Decide how an app is rendered and which primary action it gets.
 *
 * - Host free or unknown: start normally.
 * - App running on the host: "running-on-host" marker and Resume, or the
 *   "streaming-here" marker and an info toast if this PC streams it.
 * - Host busy with something else: disabled, primary action explains why.
 *   "Quit Running App & Start" is offered as a secondary action, except while
 *   this PC streams the host (that would replace the local session).
 */
export function decideAppPresentation(
	app: MoonlightApp,
	session: HostSession,
): AppPresentation {
	if (!session.busy) {
		return { primary: "start", disabled: false, offerQuitAndStart: false };
	}
	if (session.runningAppId === app.id) {
		return session.streamingHere
			? {
					primary: "already-streaming",
					marker: "streaming-here",
					disabled: false,
					offerQuitAndStart: false,
				}
			: {
					primary: "resume",
					marker: "running-on-host",
					disabled: false,
					offerQuitAndStart: false,
				};
	}
	return {
		primary: "host-busy",
		disabled: true,
		offerQuitAndStart: !session.streamingHere,
	};
}

// ---- Process state ----------------------------------------------------------

/**
 * Extract the state letter from /proc/<pid>/stat. The comm field is wrapped
 * in parentheses and may itself contain spaces or parentheses, so parse from
 * the last ")".
 */
export function parseProcStatState(stat: string): string | undefined {
	const close = stat.lastIndexOf(")");
	if (close < 0) return undefined;
	const state = stat
		.slice(close + 1)
		.trim()
		.split(/\s+/)[0];
	return state && /^[A-Za-z]$/.test(state) ? state : undefined;
}

/** Zombie (Z) and dead (X/x) processes have exited even if their PID remains. */
export function isExitedState(state: string): boolean {
	return state === "Z" || state === "X" || state === "x";
}

/**
 * Command used to launch a detached stream. With `setsid -f`, setsid forks
 * and exits immediately, so moonlight is reparented to the user's subreaper
 * (e.g. systemd --user) which reaps it, instead of lingering as a zombie
 * child of the extension host. The moonlight process keeps its plain argv
 * (`moonlight stream <host> <app>`), so /proc matching still finds it.
 */
export function buildLaunchCommand(
	bin: string,
	args: string[],
	setsidPath?: string,
): { command: string; args: string[] } {
	return setsidPath
		? { command: setsidPath, args: ["-f", bin, ...args] }
		: { command: bin, args };
}
