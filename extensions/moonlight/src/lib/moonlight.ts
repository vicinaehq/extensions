import { execFile, spawn } from "node:child_process";
import {
	accessSync,
	constants,
	existsSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Cache, getPreferenceValues } from "@vicinae/api";
import {
	buildStreamArgs,
	extractErrorMessage,
	type MoonlightApp,
	type MoonlightHost,
	parseAppListCsv,
	parseHosts,
	type StreamPreferences,
} from "./parse";
import {
	chooseConfigPath,
	expandHome,
	parseTimeoutSeconds,
	type TimeoutSetting,
} from "./prefs";
import {
	hostIdentifiers,
	buildLaunchCommand,
	isExitedState,
	type LocalStream,
	parseProcStatState,
	localStreamTarget,
	type ProcessEntry,
	selectStreamPids,
	parseServerInfo,
	type ServerInfo,
	serverInfoUrls,
	splitCmdline,
} from "./session";

export interface Preferences extends StreamPreferences {
	moonlightPath?: string;
	configPath?: string;
	serverInfoTimeout?: string;
	showHidden?: boolean;
}

const LIST_TIMEOUT_MS = 45_000;
const QUIT_TIMEOUT_MS = 30_000;

export function getPreferences(): Preferences {
	return getPreferenceValues<Preferences>();
}

/**
 * The Moonlight Binary preference with a leading `~` expanded. Every caller
 * (startup check, list/quit, stream, copied command) uses this, so a `~/` path
 * behaves the same everywhere.
 */
export function getMoonlightBinary(): string {
	const raw = getPreferences().moonlightPath?.trim() || "moonlight";
	return expandHome(raw, homedir());
}

function isExecutable(file: string): boolean {
	try {
		accessSync(file, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** Resolve the moonlight binary on PATH without executing it. */
export function resolveMoonlightBinary(): string | undefined {
	const bin = getMoonlightBinary();
	if (bin.includes("/")) return isExecutable(bin) ? bin : undefined;
	return findOnPath(bin);
}

/**
 * Look up an executable on PATH by checking file permissions only.
 *
 * Store review note (PROCESS-001): the presence check never runs, downloads or
 * installs anything; a missing moonlight binary shows an install hint instead.
 */
function findOnPath(name: string): string | undefined {
	for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
		if (!dir) continue;
		const candidate = path.join(dir, name);
		if (isExecutable(candidate)) return candidate;
	}
	return undefined;
}

const CONFIG_CANDIDATES = [
	path.join(
		process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"),
		"Moonlight Game Streaming Project",
		"Moonlight.conf",
	),
	// Flatpak installation
	path.join(
		homedir(),
		".var/app/com.moonlight_stream.Moonlight/config/Moonlight Game Streaming Project/Moonlight.conf",
	),
];

/**
 * The Moonlight.conf to use: the `configPath` preference if set, otherwise the
 * first existing auto-detected file (native, then Flatpak).
 */
export function findConfigPath(): { path?: string; explicit: boolean } {
	return chooseConfigPath(
		getPreferences().configPath,
		CONFIG_CANDIDATES,
		existsSync,
		homedir(),
	);
}

/**
 * Read paired hosts from the given Moonlight.conf. Only the [hosts] section is
 * parsed; the rest of the file (which contains the client key pair) is
 * discarded. Throws if the file cannot be read.
 */
export function readHosts(configPath: string): MoonlightHost[] {
	if (!existsSync(configPath)) throw new Error("The file does not exist.");
	return parseHosts(readFileSync(configPath, "utf-8"));
}

function boxArtDir(host: MoonlightHost): string | undefined {
	if (!host.uuid) return undefined;
	return path.join(
		process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"),
		"Moonlight Game Streaming Project",
		"Moonlight",
		"boxart",
		host.uuid,
	);
}

/** Return a local file path for the app's box art, if it exists on disk. */
export function resolveBoxArt(
	host: MoonlightHost,
	app: MoonlightApp,
): string | undefined {
	let candidate: string | undefined;
	if (app.boxArtUrl?.startsWith("file://")) {
		try {
			candidate = fileURLToPath(app.boxArtUrl);
		} catch {
			candidate = undefined;
		}
	} else if (app.boxArtUrl?.startsWith("/")) {
		candidate = app.boxArtUrl;
	}
	if (!candidate) {
		const dir = boxArtDir(host);
		if (dir) candidate = path.join(dir, `${app.id}.png`);
	}
	return candidate && existsSync(candidate) ? candidate : undefined;
}

/**
 * Run a short-lived moonlight CLI command (`list`, `quit`) and return stdout.
 *
 * Store review note (SECURITY-002 / PROCESS-001): `execFile` with an argument
 * array, no shell. Host and app names (which come from Moonlight.conf and the
 * host's app list) are passed as single argv entries and cannot alter command
 * syntax. The process is bounded by `timeout` and does not outlive the call.
 */
function runMoonlight(args: string[], timeout: number): Promise<string> {
	const bin = resolveMoonlightBinary() ?? getMoonlightBinary();
	return new Promise((resolve, reject) => {
		execFile(
			bin,
			args,
			{ timeout, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					const err = error as NodeJS.ErrnoException & { killed?: boolean };
					if (err.code === "ENOENT") {
						reject(
							new Error(
								`"${bin}" was not found. Install moonlight-qt or set the binary path in the preferences.`,
							),
						);
					} else if (err.killed) {
						reject(
							new Error(
								"Timed out waiting for the host. Is it online and reachable?",
							),
						);
					} else {
						reject(
							new Error(
								extractErrorMessage(`${stdout}\n${stderr}`) ?? err.message,
							),
						);
					}
					return;
				}
				resolve(stdout);
			},
		);
	});
}

/** Fetch the app list of a host (`moonlight list --csv <host>`). */
export async function listApps(hostName: string): Promise<MoonlightApp[]> {
	const stdout = await runMoonlight(
		["list", "--csv", hostName],
		LIST_TIMEOUT_MS,
	);
	return parseAppListCsv(stdout);
}

/** Quit the app currently running on the host (`moonlight quit <host>`). */
export async function quitApp(hostName: string): Promise<void> {
	await runMoonlight(["quit", hostName], QUIT_TIMEOUT_MS);
}

/** Arguments used for `moonlight stream`, including the flags from the preferences. */
export function streamArgs(hostName: string, appName: string): string[] {
	return buildStreamArgs(hostName, appName, getPreferences());
}

/**
 * Start a stream in a detached process so it keeps running after Vicinae
 * closes. Resolves once the process has been spawned.
 *
 * Store review note (PROCESS-001 / API-001): outliving Vicinae is intended.
 * `moonlight stream` is the GUI streaming client the user just asked to open,
 * comparable to launching an application, and must survive the launcher
 * window closing. It runs via `setsid -f` when available so it is reparented
 * to the session's process manager (systemd --user) instead of lingering as
 * an unreaped child of the extension host. @vicinae/api has no equivalent:
 * `runInTerminal` opens a terminal window and `open(target, app)` cannot pass
 * command-line arguments. No shell is involved (argument array only).
 */
export function startStream(hostName: string, appName: string): Promise<void> {
	const bin = resolveMoonlightBinary() ?? getMoonlightBinary();
	const launch = buildLaunchCommand(
		bin,
		streamArgs(hostName, appName),
		findOnPath("setsid"),
	);
	return new Promise((resolve, reject) => {
		const child = spawn(launch.command, launch.args, {
			detached: true,
			stdio: "ignore",
		});
		child.once("error", (error: NodeJS.ErrnoException) => {
			reject(
				error.code === "ENOENT" ? new Error(`"${bin}" was not found`) : error,
			);
		});
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}

// ---- App list cache -------------------------------------------------------

interface CachedApps {
	apps: MoonlightApp[];
	updatedAt: number;
}

const cache = new Cache({ namespace: "moonlight" });
const cacheKey = (host: MoonlightHost) => `apps-v1:${host.uuid ?? host.name}`;

export function loadCachedApps(host: MoonlightHost): CachedApps | undefined {
	const raw = cache.get(cacheKey(host));
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw) as CachedApps;
		return Array.isArray(parsed.apps) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function saveCachedApps(
	host: MoonlightHost,
	apps: MoonlightApp[],
): void {
	cache.set(
		cacheKey(host),
		JSON.stringify({ apps, updatedAt: Date.now() } satisfies CachedApps),
	);
}

// ---- Session detection ----------------------------------------------------

/** Host status timeout from the `serverInfoTimeout` preference (default 3 s). */
export function getServerInfoTimeout(): TimeoutSetting {
	return parseTimeoutSeconds(getPreferences().serverInfoTimeout);
}

async function fetchServerInfoFrom(
	url: string,
	signal: AbortSignal,
): Promise<ServerInfo> {
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const info = parseServerInfo(await response.text());
	if (!info) throw new Error("Not a serverinfo response");
	return info;
}

/**
 * Store review note (NETWORK-001): the only network access of the extension.
 * It targets just the addresses and ports of hosts the user paired in
 * Moonlight (read from Moonlight.conf), using the same plain-HTTP GameStream
 * status endpoint Moonlight itself polls. Nothing is sent besides Moonlight's
 * fixed public client id; no credentials or certificates are used.
 *
 * Query the host's unauthenticated serverinfo endpoint. All stored addresses
 * (each with its own port) are probed in parallel and the first valid answer
 * wins, so a host paired on the LAN still reports its state when reached via
 * its manual or remote address. Returns undefined ("unknown") on any
 * failure; this never throws.
 */
export async function fetchServerInfo(
	host: MoonlightHost,
	timeoutMs: number,
): Promise<ServerInfo | undefined> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await Promise.any(
			serverInfoUrls(host).map((url) =>
				fetchServerInfoFrom(url, controller.signal),
			),
		);
	} catch {
		return undefined;
	} finally {
		clearTimeout(timer);
		// Cancel the probes that lost the race.
		controller.abort();
	}
}

/**
 * List processes whose command line mentions "stream" (Linux /proc scan).
 *
 * Store review note (PROCESS-001): read-only. Only `/proc/<pid>/cmdline` is
 * read, to recognise this user's own `moonlight stream <host>` processes.
 */
function listStreamCandidates(): ProcessEntry[] {
	let pids: string[];
	try {
		pids = readdirSync("/proc").filter((entry) => /^\d+$/.test(entry));
	} catch {
		return [];
	}
	const processes: ProcessEntry[] = [];
	for (const pid of pids) {
		let raw: string;
		try {
			raw = readFileSync(`/proc/${pid}/cmdline`, "utf-8");
		} catch {
			continue;
		}
		if (!raw.includes("stream")) continue;
		processes.push({ pid: Number(pid), argv: splitCmdline(raw) });
	}
	return processes;
}

const SNAPSHOT_TTL_MS = 1_000;
let snapshot: { at: number; processes: ProcessEntry[] } | undefined;

/**
 * A /proc scan shared by all hosts: refreshing N hosts at once (on mount or
 * Refresh All) scans /proc once instead of N times.
 */
function streamCandidatesSnapshot(): ProcessEntry[] {
	const now = Date.now();
	if (!snapshot || now - snapshot.at > SNAPSHOT_TTL_MS) {
		snapshot = { at: now, processes: listStreamCandidates() };
	}
	return snapshot.processes;
}

/**
 * Whether this machine is already running `moonlight stream` for the host.
 * Scans /proc/<pid>/cmdline. A stream started from the Moonlight GUI runs in
 * the argument-less main process and cannot be attributed to a host, so it is
 * not detected here (the host's serverinfo still reports it as busy).
 */
export function findLocalStream(host: MoonlightHost): LocalStream | undefined {
	const identifiers = hostIdentifiers(host);
	for (const proc of streamCandidatesSnapshot()) {
		const target = localStreamTarget(proc.argv, identifiers);
		if (target) return target;
	}
	return undefined;
}

/**
 * Whether a process is still running. Zombies count as exited: stream
 * processes spawned by older versions are children of the extension host,
 * which never reaps them. Falls back to kill(pid, 0) if /proc is unreadable.
 */
function isAlive(pid: number): boolean {
	try {
		const state = parseProcStatState(
			readFileSync(`/proc/${pid}/stat`, "utf-8"),
		);
		if (state) return !isExitedState(state);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

export interface EndSessionResult {
	/** Local stream processes that received SIGTERM. */
	terminated: number[];
	/** Processes still alive after the grace period (never SIGKILLed). */
	stillRunning: number[];
	/** Set when `moonlight quit <host>` failed; the local part still ran. */
	quitError?: string;
}

const END_SESSION_GRACE_MS = 5_000;

/**
 * Store review note (PROCESS-001): signals are restricted to processes that
 * `selectStreamPids` matched as `moonlight … stream <host>` for this exact
 * host (never PID 1 or the extension itself), only SIGTERM is sent so
 * Moonlight disconnects cleanly, and there is no SIGKILL escalation. This only
 * runs when the user triggers End Session.
 *
 * End a session cleanly: SIGTERM the local `moonlight stream` processes for
 * the host (never SIGKILL), wait up to 5 s for them to exit, then run
 * `moonlight quit <host>` so the app on the host ends too. A failing quit
 * (e.g. the host is unreachable) does not throw: it is reported in
 * `quitError` next to the local outcome.
 */
export async function endSession(
	host: MoonlightHost,
): Promise<EndSessionResult> {
	const pids = selectStreamPids(
		listStreamCandidates(),
		hostIdentifiers(host),
		process.pid,
	);
	const terminated: number[] = [];
	for (const pid of pids) {
		try {
			process.kill(pid, "SIGTERM");
			terminated.push(pid);
		} catch {
			// Already gone or not ours; ignore.
		}
	}
	const deadline = Date.now() + END_SESSION_GRACE_MS;
	let stillRunning = terminated.filter(isAlive);
	while (stillRunning.length > 0 && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 200));
		stillRunning = stillRunning.filter(isAlive);
	}
	snapshot = undefined;
	try {
		await quitApp(host.name);
	} catch (error) {
		return {
			terminated,
			stillRunning,
			quitError: error instanceof Error ? error.message : String(error),
		};
	}
	return { terminated, stillRunning };
}
