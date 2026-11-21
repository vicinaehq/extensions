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

	// Same rule as moonlight-qt's NvHTTP::getCurrentGame: currentgame is only
	// trusted when the state ends in _SERVER_BUSY, because GeForce Experience
	// 2.8+ keeps currentgame set to the last played game while idle. Only
	// when there is no <state> at all is currentgame used on its own.
	if (rawState === undefined) {
		return { state: currentGame > 0 ? "busy" : "free", currentGame };
	}
	if (rawState.toUpperCase().endsWith("_SERVER_BUSY")) {
		return { state: "busy", currentGame };
	}
	return { state: "free", currentGame: 0 };
}

const DEFAULT_HTTP_PORT = 47989;

function buildServerInfoUrl(address: string, port: number | undefined): string {
	const formatted =
		address.includes(":") && !address.startsWith("[")
			? `[${address}]`
			: address;
	const p = port && port > 0 ? port : DEFAULT_HTTP_PORT;
	return `http://${formatted}:${p}/serverinfo?uniqueid=0123456789ABCDEF`;
}

/**
 * All serverinfo URLs worth trying for a host, in order of preference: each
 * stored address (local, manual, remote) with its own port, then the host
 * name on the local port. Duplicates are removed. Probing all of them lets a
 * host paired on the LAN still report its state when reached remotely.
 */
export function serverInfoUrls(host: MoonlightHost): string[] {
	const candidates: [string | undefined, number | undefined][] = [
		[host.localAddress, host.localPort],
		[host.manualAddress, host.manualPort],
		[host.remoteAddress, host.remotePort],
		[host.name, host.localPort],
	];
	const urls: string[] = [];
	for (const [address, port] of candidates) {
		if (!address) continue;
		const url = buildServerInfoUrl(address, port);
		if (!urls.includes(url)) urls.push(url);
	}
	return urls;
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
	const positionals = streamPositionals(argv.slice(streamIndex + 1));
	if (positionals.length === 0) return undefined;
	// `moonlight stream [options] <host> <app>`: with an unknown option that
	// takes a value the extra positional comes first, so count from the end.
	const hostArg =
		positionals.length >= 2
			? positionals[positionals.length - 2]
			: positionals[0];
	const appName = positionals.length >= 2 ? positionals.at(-1) : undefined;
	const ids = new Set(identifiers.map((i) => i.toLowerCase()));
	if (!hostArg || !ids.has(hostArg.toLowerCase())) return undefined;
	return { appName };
}

/** moonlight-qt `stream` options that consume the following argument. */
const VALUE_OPTIONS = new Set([
	"--resolution",
	"--fps",
	"--bitrate",
	"--packet-size",
	"--display-mode",
	"--audio-config",
	"--video-codec",
	"--video-decoder",
	"--capture-system-keys",
]);

/** Positional arguments of `moonlight stream`, with options and their values removed. */
function streamPositionals(args: string[]): string[] {
	const positionals: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		if (arg === "--") {
			positionals.push(...args.slice(i + 1));
			break;
		}
		if (arg.startsWith("-") && arg.length > 1) {
			if (!arg.includes("=") && VALUE_OPTIONS.has(arg)) i++;
			continue;
		}
		positionals.push(arg);
	}
	return positionals;
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

/**
 * What serverinfo says about the host:
 * - `loading`: the status request has not answered yet;
 * - `free` / `busy`: the host answered;
 * - `unknown`: the request failed, timed out or returned nothing usable.
 */
export type HostStatus = "loading" | "free" | "busy" | "unknown";

export interface HostSession {
	/** Host state as reported by serverinfo (independent of the local scan). */
	status: HostStatus;
	/** ID of the app running on the host, if known. */
	runningAppId?: number;
	/** Name of the running app, if known. */
	runningAppName?: string;
	/** Whether this PC is streaming the host. */
	streamingHere: boolean;
	/** Whether the host is busy (running an app or streamed from this PC). */
	busy: boolean;
}

/** Map the last serverinfo result (and whether a request is pending) to a status. */
export function resolveHostStatus(
	serverInfo: ServerInfo | undefined,
	statusLoading: boolean,
): HostStatus {
	if (!serverInfo) return statusLoading ? "loading" : "unknown";
	// While refreshing, keep showing the previous answer instead of flickering.
	return serverInfo.state;
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
	statusLoading = false,
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
		status: resolveHostStatus(serverInfo, statusLoading),
		runningAppId,
		runningAppName,
		streamingHere,
		busy: streamingHere || runningAppId !== undefined,
	};
}

/** One-line host status for the section subtitle, or undefined when free. */
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
	if (session.status === "loading") return "checking status…";
	if (session.status === "unknown") return "status unknown";
	return undefined;
}

export type PrimaryAction =
	/** Start a new stream (host confirmed free). */
	| "start"
	/** Start a new stream while the host status is loading or unknown. */
	| "start-unconfirmed"
	/** Resume the app running on the host (not streamed here). */
	| "resume"
	/** The app is already streamed by this PC: explain with a toast. */
	| "already-streaming"
	/** The host is busy with another app: explain with a toast. */
	| "host-busy";

export type StatusMarker =
	| "streaming-here"
	| "running-on-host"
	/** Neutral marker: host status request still pending. */
	| "status-loading"
	/** Neutral marker: host status request failed. */
	| "status-unknown";

export interface AppPresentation {
	primary: PrimaryAction;
	/**
	 * Per-item status marker. Only the running app gets a session marker;
	 * every app gets a neutral marker while the host status is not confirmed.
	 */
	marker?: StatusMarker;
	/** Render as unavailable (muted icon, no start as primary action). */
	disabled: boolean;
	/** Offer "Quit Running App & Start" as a secondary action. */
	offerQuitAndStart: boolean;
}

/**
 * Decide how an app is rendered and which primary action it gets.
 *
 * - This PC streams the host (local /proc scan): never offer a second
 *   stream, whatever serverinfo says.
 * - App running on the host: "running-on-host" marker and Resume, or the
 *   "streaming-here" marker and an info toast if this PC streams it.
 * - Host busy with something else: disabled, primary action explains why.
 *   "Quit Running App & Start" is offered as a secondary action, except while
 *   this PC streams the host (that would replace the local session).
 * - Host confirmed free: start normally.
 * - Host status loading or unknown: start is still allowed, labelled as
 *   unconfirmed, with a neutral marker.
 *
 * Store review note (CORRECTNESS-001): a loading or failed status is modelled
 * explicitly as `loading` / `unknown` and never presented as "free". Starting
 * is still deliberately allowed in that state: the status port (47989) can be
 * unreachable while streaming works (VPN, or a remote address with only the
 * stream ports forwarded), and blocking or waiting for the status would add
 * up to the full status timeout of latency to every start. A second local
 * stream is still prevented by the /proc check, which does not depend on
 * serverinfo, and if the host turns out to be busy, Moonlight itself resolves
 * that on start (it resumes the running app or asks before quitting it).
 */
export function decideAppPresentation(
	app: MoonlightApp,
	session: HostSession,
): AppPresentation {
	if (!session.busy) {
		if (session.status === "loading" || session.status === "unknown") {
			return {
				primary: "start-unconfirmed",
				marker:
					session.status === "loading" ? "status-loading" : "status-unknown",
				disabled: false,
				offerQuitAndStart: false,
			};
		}
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
