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
	const exe = argv[0]?.split("/").pop();
	if (!exe || !MOONLIGHT_EXE.test(exe)) return false;
	const streamIndex = argv.indexOf("stream", 1);
	if (streamIndex < 0) return false;
	const ids = new Set(identifiers.map((i) => i.toLowerCase()));
	return argv.slice(streamIndex + 1).some((arg) => ids.has(arg.toLowerCase()));
}

/** Split raw /proc/<pid>/cmdline contents into argv. */
export function splitCmdline(raw: string): string[] {
	return raw.split("\0").filter((part) => part !== "");
}

export type AppActionKind =
	| "start"
	| "resume"
	| "quit-and-start"
	| "already-streaming";

export interface AppAction {
	kind: AppActionKind;
	/** Name of the app running on the host, if any. */
	runningAppName?: string;
}

/**
 * Decide which primary action an app should offer.
 *
 * - A local stream to this host is active: never start another one.
 * - The host runs this app: resume it.
 * - The host runs a different app: quit it first, then start.
 * - Otherwise (free or unknown state): start normally.
 */
export function decideAppAction(
	app: MoonlightApp,
	apps: MoonlightApp[],
	serverInfo: ServerInfo | undefined,
	localStream: boolean,
): AppAction {
	const runningId =
		serverInfo && serverInfo.state !== "free" ? serverInfo.currentGame : 0;
	const runningAppName =
		runningId > 0
			? (apps.find((a) => a.id === runningId)?.name ?? `app ${runningId}`)
			: undefined;

	if (localStream) return { kind: "already-streaming", runningAppName };
	if (runningId > 0 && runningId === app.id)
		return { kind: "resume", runningAppName };
	if (runningId > 0) return { kind: "quit-and-start", runningAppName };
	return { kind: "start" };
}
