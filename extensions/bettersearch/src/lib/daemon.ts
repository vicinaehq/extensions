import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { join } from "node:path";
import { environment } from "@vicinae/api";
import { loadPreferences } from "./preferences";

const REQUEST_TIMEOUT_MS = 10_000;
const STARTUP_TIMEOUT_MS = 8_000;

export type GitStatus = string;

export type FileEntry = {
	kind: "file" | "directory";
	path: string;
	relativePath: string;
	name: string;
	root: string;
	size?: number;
	modified?: number;
	gitStatus?: GitStatus;
	score: number;
};

export type SearchResponse = {
	items: FileEntry[];
	hasMore: boolean;
	totalMatched: number;
	totalFiles: number;
	location?:
		| { type: "line"; line: number }
		| { type: "position"; line: number; col: number }
		| {
				type: "range";
				start: { line: number; col: number };
				end: { line: number; col: number };
		  };
	scanning: boolean;
};

export type GrepMode = "plain" | "regex" | "fuzzy";

export type GrepCursor = { root: number; offset: number | null };

export type GrepEntry = {
	path: string;
	relativePath: string;
	name: string;
	root: string;
	line: number;
	column: number;
	text: string;
	ranges: [number, number][];
	before: string[];
	after: string[];
	gitStatus: GitStatus;
};

export type GrepResponse = {
	items: GrepEntry[];
	nextCursor: GrepCursor | null;
	regexError?: string;
	filesSearched: number;
	scanning: boolean;
};

export type RootStatus = {
	root: string;
	scannedFilesCount?: number;
	isScanning?: boolean;
	isWatcherReady?: boolean;
	isWarmupComplete?: boolean;
	error?: string;
};

export type DaemonStatus = {
	build: string;
	script: string;
	pid: number;
	platform: string;
	error: string | null;
	roots: RootStatus[];
};

const daemonDir = () => join(environment.assetsPath, "daemon");
const daemonScript = () => join(daemonDir(), "daemon.mjs");

const scriptBuild = () =>
	createHash("sha1").update(readFileSync(daemonScript())).digest("hex");

export const socketPath = () => {
	if (process.platform === "win32") {
		return `\\\\.\\pipe\\vicinae-bettersearch-${os.userInfo().username}`;
	}
	const dir = process.env.XDG_RUNTIME_DIR || os.tmpdir();
	return join(dir, `vicinae-bettersearch-${os.userInfo().uid}.sock`);
};

export const logPath = () => join(environment.supportPath, "daemon.log");

export class DaemonError extends Error {}

function request<T>(
	method: string,
	params: unknown = {},
	timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(socketPath());
		let buffer = "";
		let settled = false;

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			fn();
		};

		socket.setTimeout(timeoutMs, () =>
			finish(() => reject(new DaemonError(`fff daemon timed out on ${method}`))),
		);
		socket.on("error", (e) => finish(() => reject(e)));
		socket.on("connect", () => {
			socket.write(`${JSON.stringify({ id: 1, method, params })}\n`);
		});
		socket.on("data", (chunk) => {
			buffer += chunk.toString("utf8");
			const nl = buffer.indexOf("\n");
			if (nl === -1) return;
			const response = JSON.parse(buffer.slice(0, nl));
			finish(() =>
				response.ok
					? resolve(response.value as T)
					: reject(new DaemonError(response.error)),
			);
		});
	});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ping(): Promise<DaemonStatus | null> {
	try {
		return await request<DaemonStatus>("ping", {}, 1_000);
	} catch {
		return null;
	}
}

function spawnDaemon() {
	if (!existsSync(join(daemonDir(), "node_modules", "@ff-labs", "fff-node"))) {
		throw new DaemonError(
			"fff native bindings are missing. Reinstall the extension with `npm install && npm run build`.",
		);
	}

	mkdirSync(environment.supportPath, { recursive: true });
	const log = openSync(logPath(), "a");
	const child = spawn(process.execPath, [daemonScript(), socketPath()], {
		cwd: daemonDir(),
		detached: true,
		windowsHide: true,
		stdio: ["ignore", log, log],
	});
	child.unref();
}

async function startDaemon(): Promise<DaemonStatus> {
	spawnDaemon();
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await sleep(50);
		const status = await ping();
		if (status) return status;
	}
	throw new DaemonError(`fff daemon did not start. See ${logPath()}`);
}

let ready: Promise<void> | null = null;

/** Starts the daemon if needed and pushes the current preferences to it. */
export function ensureDaemon(): Promise<void> {
	ready ??= (async () => {
		let status = await ping();

		// A daemon from an older build or another install location: replace it.
		if (
			status &&
			(status.script !== daemonScript() || status.build !== scriptBuild())
		) {
			await stopDaemon();
			status = null;
		}

		if (!status) await startDaemon();

		const prefs = loadPreferences();
		await request<DaemonStatus>("configure", {
			roots: prefs.roots,
			followSymlinks: prefs.followSymlinks,
			dataDir: environment.supportPath,
			// Commands run in worker threads, so pid is the Vicinae extension
			// manager and ppid the Vicinae server. The daemon exits when either
			// does. Both are needed: the manager can linger after the server is
			// stopped, for example by a systemd unit with KillMode=process.
			owners: [process.pid, process.ppid].filter((pid) => pid > 1),
		});
	})().catch((e) => {
		ready = null;
		throw e;
	});
	return ready;
}

async function call<T>(method: string, params?: unknown): Promise<T> {
	await ensureDaemon();
	return request<T>(method, params);
}

export const fff = {
	search: (params: { query: string; page?: number; pageSize?: number }) =>
		call<SearchResponse>("search", params),
	grep: (params: {
		query: string;
		mode: GrepMode;
		cursor?: GrepCursor | null;
		pageSize?: number;
	}) => call<GrepResponse>("grep", params),
	track: (query: string, path: string) =>
		call<boolean>("track", { query, path }).catch(() => false),
	status: () => call<DaemonStatus>("status"),
	rescan: () => call<DaemonStatus>("rescan"),
};

export async function stopDaemon() {
	ready = null;
	try {
		await request("shutdown", {}, 2_000);
	} catch {
		return;
	}
	// Wait for the socket to go away so a fresh daemon can bind it.
	const deadline = Date.now() + 3_000;
	while (Date.now() < deadline && (await ping())) await sleep(50);
}

export async function restartDaemon() {
	await stopDaemon();
	await ensureDaemon();
}
