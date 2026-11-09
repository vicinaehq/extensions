import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getPreferenceValues } from "@vicinae/api";
import { dataDirForVariant, findOnPath, isBraveRunning, variantInfo, type BraveVariant } from "./utils";

type BravePreferences = {
	debug_port?: string;
};

const preferences = getPreferenceValues<BravePreferences>();

export { isBraveRunning };

export type BraveTab = {
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

export const DEFAULT_DEBUG_PORT = 9222;

const cachedBinaries: Partial<Record<BraveVariant, string | undefined>> = {};

export function findBraveBinary(variant: BraveVariant): string | undefined {
	if (variant in cachedBinaries) return cachedBinaries[variant];
	const binary = variantInfo(variant).binaries.map(findOnPath).find((full) => full !== undefined);
	cachedBinaries[variant] = binary;
	return binary;
}

function flagsFilePath(variant: BraveVariant): string {
	const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(configHome, variantInfo(variant).flagsFile);
}

function flagsFileHasDebugPort(variant: BraveVariant): boolean {
	try {
		return readFileSync(flagsFilePath(variant), "utf-8")
			.split("\n")
			.some((line) => line.trim().startsWith("--remote-debugging-port"));
	} catch {
		return false;
	}
}

export function launchBrave(variant: BraveVariant, args: string[] = []): void {
	const binary = findBraveBinary(variant);
	if (!binary) {
		throw new Error(`${variantInfo(variant).name} binary not found on PATH`);
	}
	const debugArgs = !configuredPort() && !flagsFileHasDebugPort(variant) ? ["--remote-debugging-port=0"] : [];
	spawn(binary, [...debugArgs, ...args], { detached: true, stdio: "ignore" }).unref();
}

function readMainPid(variant: BraveVariant): number | undefined {
	try {
		const pid = Number(readlinkSync(join(dataDirForVariant(variant), "SingletonLock")).split("-").pop());
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

export async function quitBrave(variant: BraveVariant): Promise<boolean> {
	const pid = readMainPid(variant);
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

export function ensureDebuggingFlag(variant: BraveVariant): string {
	const flagsPath = flagsFilePath(variant);
	const line = `--remote-debugging-port=${configuredPort() ?? DEFAULT_DEBUG_PORT}`;

	let content = "";
	try {
		content = readFileSync(flagsPath, "utf-8");
	} catch {
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

function portFromDevToolsActivePort(variant: BraveVariant): number | undefined {
	try {
		const firstLine = readFileSync(join(dataDirForVariant(variant), "DevToolsActivePort"), "utf-8").split("\n")[0] ?? "";
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

export async function resolveDebugPort(variant: BraveVariant): Promise<number | undefined> {
	const configured = configuredPort();
	if (configured) return configured;

	for (const port of [portFromDevToolsActivePort(variant), DEFAULT_DEBUG_PORT]) {
		if (port && (await isCdpReachable(port))) return port;
	}

	return undefined;
}

const DEBUG_PORT_HELP = (name: string) =>
	`${name} is running without remote debugging, and it can only be enabled when the browser starts. Use the actions below, then restart it.`;

async function cdpFetch(variant: BraveVariant, pathname: string, init?: RequestInit): Promise<Response> {
	const port = await resolveDebugPort(variant);
	if (!port) throw new Error(DEBUG_PORT_HELP(variantInfo(variant).name));

	const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
		...init,
		signal: AbortSignal.timeout(3000),
	});
	if (!response.ok) {
		throw new Error(`${variantInfo(variant).name} debugging endpoint returned HTTP ${response.status}`);
	}
	return response;
}

export async function listTabs(variant: BraveVariant): Promise<BraveTab[]> {
	const targets = (await (await cdpFetch(variant, "/json/list")).json()) as CdpTarget[];
	return targets
		.filter((target) => target.type === "page")
		.map((target) => ({ id: target.id, title: target.title, url: target.url, faviconUrl: target.faviconUrl }));
}

export async function activateTab(variant: BraveVariant, id: string): Promise<void> {
	await cdpFetch(variant, `/json/activate/${encodeURIComponent(id)}`);
}

export async function closeTab(variant: BraveVariant, id: string): Promise<void> {
	await cdpFetch(variant, `/json/close/${encodeURIComponent(id)}`);
}

export async function createTab(variant: BraveVariant, url = "brave://newtab/"): Promise<boolean> {
	try {
		await cdpFetch(variant, `/json/new?${url}`, { method: "PUT" });
		return true;
	} catch {
		return false;
	}
}