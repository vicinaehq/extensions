import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { getPreferenceValues } from "@vicinae/api";
import { HELIUM_DATA_DIR } from "./utils";

type HeliumPreferences = {
	profile_dir: string;
	debug_port?: string;
};

const preferences = getPreferenceValues<HeliumPreferences>();

export type HeliumTab = {
	id: string;
	title: string;
	url: string;
	faviconUrl?: string;
};

type CdpTarget = {
	id: string;
	title: string;
	url: string;
	type: string;
	faviconUrl?: string;
};

/** Recommended port used in docs and the one-click flags-file setup. */
export const DEFAULT_DEBUG_PORT = 9222;

let cachedBinary: string | undefined;

/**
 * Locate the Helium binary on PATH. Distro packages ship it as
 * `helium-browser` (a wrapper script), while some installs expose `helium`.
 */
export function findHeliumBinary(): string | undefined {
	if (cachedBinary) return cachedBinary;

	for (const candidate of ["helium-browser", "helium"]) {
		for (const dir of (process.env.PATH ?? "").split(delimiter)) {
			if (!dir) continue;
			const full = join(dir, candidate);
			try {
				if (existsSync(full)) {
					cachedBinary = full;
					return full;
				}
			} catch {
				// unreadable PATH entry; skip
			}
		}
	}

	return undefined;
}

/** Path of the flags file read by Helium's Linux launcher wrapper. */
function flagsFilePath(): string {
	const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(configHome, "helium-browser-flags.conf");
}

function flagsFileHasDebugPort(): boolean {
	try {
		return readFileSync(flagsFilePath(), "utf-8")
			.split("\n")
			.some((line) => line.trim().startsWith("--remote-debugging-port"));
	} catch {
		return false;
	}
}

/**
 * Launch Helium detached; with an existing instance the singleton forwards the
 * args. When nothing else enables debugging yet (no preference, no flags-file
 * entry), fresh launches get an ephemeral debugging port discoverable through
 * `DevToolsActivePort`, so Search Tabs works without manual configuration.
 * Chromium uses the last occurrence of a switch, so the flag is only added
 * when it cannot override one the user already set; it is ignored by the
 * singleton anyway when an instance is already running.
 */
export function launchHelium(args: string[] = []): void {
	const binary = findHeliumBinary();
	if (!binary) {
		throw new Error("Helium binary not found on PATH (looked for helium-browser and helium)");
	}
	const debugArgs = !configuredPort() && !flagsFileHasDebugPort() ? ["--remote-debugging-port=0"] : [];
	spawn(binary, [...debugArgs, ...args], { detached: true, stdio: "ignore" }).unref();
}

/** Chromium holds a singleton lock file in the user data dir while running. */
export function isHeliumRunning(): boolean {
	return existsSync(join(HELIUM_DATA_DIR, "SingletonLock"));
}

/** The singleton lock is a symlink named `hostname-pid`; the pid is the main process. */
function readMainPid(): number | undefined {
	try {
		const pid = Number(readlinkSync(join(HELIUM_DATA_DIR, "SingletonLock")).split("-").pop());
		return Number.isInteger(pid) && pid > 0 ? pid : undefined;
	} catch {
		return undefined;
	}
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Ask the running Helium instance to shut down (SIGTERM to the main process, a
 * graceful quit that still saves the session). Waits until the process has
 * actually exited so a subsequent launch starts fresh instead of forwarding to
 * the dying instance through the singleton. Resolves false when nothing was
 * running or the process did not exit within the timeout.
 */
export async function quitHelium(): Promise<boolean> {
	const pid = readMainPid();
	if (!pid || !isPidAlive(pid)) return false;

	try {
		process.kill(pid, "SIGTERM");
	} catch {
		return false;
	}

	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		if (!isPidAlive(pid)) return true;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	return !isPidAlive(pid);
}

/**
 * Append the debugging flag to Helium's launcher flags file so debugging is
 * enabled the next time Helium starts. The wrapper shipped with Helium's Linux
 * packages reads `$XDG_CONFIG_HOME/helium-browser-flags.conf`.
 */
export function ensureDebuggingFlag(): string {
	const flagsPath = flagsFilePath();
	const line = `--remote-debugging-port=${configuredPort() ?? DEFAULT_DEBUG_PORT}`;

	let content = "";
	try {
		content = readFileSync(flagsPath, "utf-8");
	} catch {
		// file does not exist yet; it gets created below
	}

	if (!content.split("\n").some((existing) => existing.trim() === line)) {
		appendFileSync(flagsPath, `${content && !content.endsWith("\n") ? "\n" : ""}${line}\n`);
	}

	return flagsPath;
}

function configuredPort(): number | undefined {
	const raw = (preferences.debug_port ?? "").trim();
	if (!raw) return undefined;
	const port = Number(raw);
	return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined;
}

/** Chromium writes this file when started with an ephemeral debugging port. */
function portFromDevToolsActivePort(): number | undefined {
	try {
		const firstLine = readFileSync(join(HELIUM_DATA_DIR, "DevToolsActivePort"), "utf-8").split("\n")[0] ?? "";
		const port = Number(firstLine.trim());
		return Number.isInteger(port) && port > 0 ? port : undefined;
	} catch {
		return undefined;
	}
}

async function isCdpReachable(port: number): Promise<boolean> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Find the debugging port without user configuration: explicit preference,
 * then `DevToolsActivePort` (ephemeral launches), then the documented default.
 * Candidates are verified against the live endpoint, which also discards stale
 * `DevToolsActivePort` files left behind by a crash.
 */
export async function resolveDebugPort(): Promise<number | undefined> {
	const configured = configuredPort();
	if (configured) return configured;

	for (const port of [portFromDevToolsActivePort(), DEFAULT_DEBUG_PORT]) {
		if (port && (await isCdpReachable(port))) return port;
	}

	return undefined;
}

const DEBUG_PORT_HELP =
	"Helium is running without remote debugging, and it can only be enabled when Helium starts. Use the actions below, then restart Helium.";

async function cdpFetch(pathname: string, init?: RequestInit): Promise<Response> {
	const port = await resolveDebugPort();
	if (!port) throw new Error(DEBUG_PORT_HELP);

	const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
		...init,
		signal: AbortSignal.timeout(3000),
	});
	if (!response.ok) {
		throw new Error(`Helium debugging endpoint returned HTTP ${response.status}`);
	}
	return response;
}

export async function listTabs(): Promise<HeliumTab[]> {
	const targets = (await (await cdpFetch("/json/list")).json()) as CdpTarget[];
	return targets
		.filter((target) => target.type === "page")
		.map((target) => ({ id: target.id, title: target.title, url: target.url, faviconUrl: target.faviconUrl }));
}

/** Focus the tab; Chromium also raises the window that contains it. */
export async function activateTab(id: string): Promise<void> {
	await cdpFetch(`/json/activate/${encodeURIComponent(id)}`);
}

export async function closeTab(id: string): Promise<void> {
	await cdpFetch(`/json/close/${encodeURIComponent(id)}`);
}

/**
 * Open a new tab through the debugging endpoint. Returns false when the
 * endpoint is unavailable so callers can fall back to singleton forwarding.
 */
export async function createTab(url = "chrome://newtab/"): Promise<boolean> {
	try {
		await cdpFetch(`/json/new?${url}`, { method: "PUT" });
		return true;
	} catch {
		return false;
	}
}
