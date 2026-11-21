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
	serverInfoUrl,
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

export function getMoonlightBinary(): string {
	return getPreferences().moonlightPath?.trim() || "moonlight";
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
	if (bin.includes("/")) {
		const expanded = bin.startsWith("~/")
			? path.join(homedir(), bin.slice(2))
			: bin;
		return isExecutable(expanded) ? expanded : undefined;
	}
	return findOnPath(bin);
}

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

function runMoonlight(args: string[], timeout: number): Promise<string> {
	const bin = getMoonlightBinary();
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

/**
 * Query the host's unauthenticated serverinfo endpoint. Returns undefined
 * ("unknown") on any failure; this never throws.
 */
export async function fetchServerInfo(
	host: MoonlightHost,
	timeoutMs: number,
): Promise<ServerInfo | undefined> {
	try {
		const response = await fetch(serverInfoUrl(host), {
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) return undefined;
		return parseServerInfo(await response.text());
	} catch {
		return undefined;
	}
}

/**
 * Whether this machine is already running `moonlight stream` for the host.
 * Scans /proc/<pid>/cmdline. A stream started from the Moonlight GUI runs in
 * the argument-less main process and cannot be attributed to a host, so it is
 * not detected here (the host's serverinfo still reports it as busy).
 */
/** List processes whose command line mentions "stream" (Linux /proc scan). */
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

export function findLocalStream(host: MoonlightHost): LocalStream | undefined {
	const identifiers = hostIdentifiers(host);
	for (const proc of listStreamCandidates()) {
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
}

const END_SESSION_GRACE_MS = 5_000;

/**
 * End a session cleanly: SIGTERM the local `moonlight stream` processes for
 * the host (never SIGKILL), wait up to 5 s for them to exit, then run
 * `moonlight quit <host>` so the app on the host ends too. Throws if the
 * quit command fails.
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
	await quitApp(host.name);
	return { terminated, stillRunning };
}
