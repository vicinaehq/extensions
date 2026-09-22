import { existsSync } from "node:fs";
import { run } from "./exec";
import {
	type FlathubApp,
	type FlathubListedApp,
	fetchFlathubInstalled,
	fetchFlathubRemote,
	findFlatpakIcon,
} from "./flathub";

export type PackageFlags = {
	installed: boolean;
	automatic: boolean;
	upgradable: boolean;
	local: boolean;
};

export type AptPackage = {
	name: string;
	suite: string;
	version: string;
	arch: string;
	flags: PackageFlags;
	/** For upgradable packages: the currently installed version. */
	current: string | null;
	description: string;
	/** Package manager that owns this entry. */
	manager: "apt" | "flatpak";
	/** Local path to an app icon, if one is available. */
	icon: string | null;
};

/**
 * Build a minimal `FlathubApp` from a listed package, for UIs that only know
 * how to render Flathub apps.
 */
export function flathubAppFromListed(pkg: AptPackage): FlathubApp {
	return { app_id: pkg.name, name: pkg.name, summary: "" };
}

export function parseAptListLine(raw: string): AptPackage | null {
	const line = raw.trim();
	if (
		line === "" ||
		line.startsWith("Listing") ||
		line.startsWith("E:") ||
		line.startsWith("W:")
	) {
		return null;
	}
	const slash = line.indexOf("/");
	if (slash === -1) return null;

	const name = line.slice(0, slash);
	let rest = line.slice(slash + 1);

	const flagsMatch = /\[([^\]]*)]\s*$/.exec(rest);
	const flagsRaw = flagsMatch ? flagsMatch[1] : "";
	if (flagsMatch) rest = rest.slice(0, flagsMatch.index).trim();

	const tokens = rest.split(/\s+/).filter(Boolean);
	if (tokens.length < 2) return null;

	const suite = tokens[0];
	const arch = tokens.length >= 3 ? tokens[tokens.length - 1] : "";
	const version = arch ? tokens.slice(1, -1).join(" ") : tokens[1];

	const flags = parseFlags(flagsRaw);
	const current = flags.upgradable
		? (currentFromFlags(flagsRaw) ?? version)
		: flags.installed
			? version
			: null;

	return {
		name,
		suite,
		version,
		arch,
		flags,
		current,
		description: "",
		manager: "apt",
		icon: null,
	};
}

function parseFlags(raw: string): PackageFlags {
	const flags: PackageFlags = {
		installed: false,
		automatic: false,
		upgradable: false,
		local: false,
	};
	for (const part of raw.split(",")) {
		const token = part.trim().toLowerCase();
		if (token.includes("installed")) flags.installed = true;
		if (token.includes("automatic")) flags.automatic = true;
		if (token.includes("upgradable")) flags.upgradable = true;
		if (token.includes("local")) flags.local = true;
	}
	return flags;
}

function currentFromFlags(raw: string): string | null {
	const match = /upgradable from:\s*([^,\]]*)$/i.exec(raw.trim());
	if (!match) return null;
	const value = match[1].trim();
	return value === "" ? null : value;
}

export function parseAptList(output: string): AptPackage[] {
	const packages: AptPackage[] = [];
	for (const line of output.split("\n")) {
		const pkg = parseAptListLine(line);
		if (pkg) packages.push(pkg);
	}
	return packages;
}

export type PackageListKind = "installed" | "all" | "upgradable";

const LIST_ARGS: Record<PackageListKind, string[]> = {
	installed: ["--installed"],
	all: [],
	upgradable: ["--upgradable"],
};

/**
 * Fetch a list of packages via `apt list`. Runs without elevated privileges
 * since it only reads the local package cache.
 * For the `installed` and `all` kinds, Flatpak applications are merged in.
 */
export async function fetchPackageList(
	kind: PackageListKind,
): Promise<AptPackage[]> {
	const args: string[] = ["list"];
	if (LIST_ARGS[kind].length > 0) args.push(...LIST_ARGS[kind]);

	const result = await run("apt", args, { timeout: 60_000 });
	if (!result.ok) {
		throw new Error(
			result.stderr.trim() ||
				result.stdout.trim() ||
				`apt ${args.join(" ")} failed`,
		);
	}
	const all = parseAptList(result.stdout);
	if (kind === "installed") {
		const aptInstalled = all.filter((pkg) => pkg.flags.installed);
		const flatpakInstalled = (await fetchFlathubInstalled()).map((pkg) =>
			flathubToAptPackage(pkg, true),
		);
		return [...aptInstalled, ...flatpakInstalled].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
	}
	if (kind === "upgradable") {
		const filtered = all.filter((pkg) => pkg.flags.upgradable);
		return filtered.sort((a, b) => a.name.localeCompare(b.name));
	}
	const flatpakAvailable = (await fetchFlathubRemote()).map((pkg) =>
		flathubToAptPackage(pkg, false),
	);
	return [...all, ...flatpakAvailable].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
}

function flathubToAptPackage(
	pkg: FlathubListedApp,
	installed: boolean,
): AptPackage {
	return {
		name: pkg.name,
		suite: pkg.origin || "flathub",
		version: pkg.version || pkg.branch || "",
		arch: pkg.arch,
		flags: {
			installed,
			automatic: false,
			upgradable: false,
			local: false,
		},
		current: null,
		description: "",
		manager: "flatpak",
		icon: findFlatpakIcon(pkg.name),
	};
}

export type PackageInfo = {
	name: string;
	paragraphs: Array<Record<string, string[]>>;
};

/**
 * Fetch the full description and metadata for a package via `apt-cache show`.
 */
export async function fetchPackageInfo(
	name: string,
): Promise<PackageInfo | null> {
	const result = await run("apt-cache", ["show", name], { timeout: 30_000 });
	if (!result.ok) return null;

	const paragraphs: Array<Record<string, string[]>> = [];
	let current: Record<string, string[]> | null = null;
	for (const line of result.stdout.split("\n")) {
		if (line === "") {
			if (current) paragraphs.push(current);
			current = null;
			continue;
		}
		if (!/^\s/.test(line)) {
			const sep = line.indexOf(":");
			if (sep === -1) continue;
			const key = line.slice(0, sep);
			const value = line.slice(sep + 1).trim();
			if (!current) current = {};
			current[key] = [value];
		} else if (current) {
			const lastKey = Object.keys(current)[Object.keys(current).length - 1];
			if (lastKey) {
				current[lastKey].push(line.trim());
			}
		}
	}
	if (current) paragraphs.push(current);

	return { name, paragraphs };
}

export type AptOperation = {
	args: string[];
	title: string;
	successMessage: string;
};

export type OperationResult = {
	ok: boolean;
	code: number | null;
	stdout: string;
	stderr: string;
	command: string;
};

const APT_ENV = { DEBIAN_FRONTEND: "noninteractive" };
const PRIVILEGED_TIMEOUT = 20 * 60 * 1000;

export function pkexecAvailable(): boolean {
	return ["/usr/bin/pkexec", "/bin/pkexec"].some((path) => existsSync(path));
}

/**
 * Run an elevated operation via `pkexec`, capturing the output.
 * The polkit authentication dialog is shown by the desktop environment.
 */
export async function runPrivilegedCommand(
	command: string,
	args: string[],
	_description?: string,
): Promise<OperationResult> {
	const full = `pkexec ${command} ${args.join(" ")}`;
	if (!pkexecAvailable()) {
		return {
			ok: false,
			code: null,
			stdout: "",
			stderr:
				"`pkexec` was not found in PATH. Install polkit (e.g. `apt install policykit-1`) or use the 'Retry in Terminal' action with sudo.",
			command: full,
		};
	}
	try {
		const result = await run("pkexec", [command, ...args], {
			env: APT_ENV,
			timeout: PRIVILEGED_TIMEOUT,
		});
		return {
			ok: result.ok,
			code: result.code,
			stdout: result.stdout,
			stderr: result.stderr,
			command: full,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			code: null,
			stdout: "",
			stderr: message,
			command: full,
		};
	}
}

/**
 * Run an elevated apt-get operation via `pkexec`, capturing the output.
 */
export async function runPrivilegedApGet(
	args: string[],
	description?: string,
): Promise<OperationResult> {
	return runPrivilegedCommand("apt-get", args, description);
}

/**
 * Run `apt-get update` elevated. Returns the result.
 */
export async function runAptUpdate(): Promise<OperationResult> {
	return runPrivilegedApGet(["update"], "Refresh package lists");
}

/**
 * Run `apt update` then `apt-get upgrade --with-new-pkgs` elevated.
 */
export async function runAptUpgradeAll(): Promise<OperationResult> {
	const update = await runPrivilegedApGet(["update"], "Refresh package lists");
	if (!update.ok) return update;
	return runPrivilegedApGet(
		["upgrade", "-y", "--with-new-pkgs"],
		"Upgrade all packages",
	);
}

/**
 * Install one or more packages.
 */
export function runAptInstall(packages: string[]): Promise<OperationResult> {
	return runPrivilegedApGet(
		["install", "-y", ...packages],
		`Install ${packages.join(", ")}`,
	);
}

/**
 * Remove one or more packages (keeping their configuration files).
 */
export function runAptRemove(packages: string[]): Promise<OperationResult> {
	return runPrivilegedApGet(
		["remove", "-y", ...packages],
		`Remove ${packages.join(", ")}`,
	);
}

/**
 * Fully remove packages including configuration files.
 */
export function runAptPurge(packages: string[]): Promise<OperationResult> {
	return runPrivilegedApGet(
		["purge", "-y", ...packages],
		`Purge ${packages.join(", ")}`,
	);
}

/**
 * Clean up unused dependency packages and stale cache entries.
 */
export async function runAptCleanup(): Promise<OperationResult> {
	const autoremove = await runPrivilegedApGet(
		["autoremove", "-y", "--purge"],
		"Remove unused packages",
	);
	if (!autoremove.ok) return autoremove;
	return runPrivilegedApGet(["autoclean"], "Clean package cache");
}

export function resultMarkdown(
	result: OperationResult,
	heading: string,
): string {
	const lines: string[] = [];
	lines.push(`# ${result.ok ? "Succeeded" : "Failed"}: ${heading}`);
	lines.push("");
	lines.push(`**Command:** \`${result.command}\``);
	if (result.code !== null) lines.push(`**Exit code:** ${result.code}`);
	lines.push("");
	const body = [result.stdout.trim(), result.stderr.trim()]
		.filter(Boolean)
		.join("\n");
	if (body) {
		lines.push("```text");
		lines.push(body.slice(0, 30_000));
		lines.push("```");
	} else {
		lines.push("No output.");
	}
	return lines.join("\n");
}
