import { existsSync } from "node:fs";
import { type OperationResult, runPrivilegedCommand } from "./apt";
import { run } from "./exec";

export type FlatpakInstallation = "system" | "user";

/** Whether the `flatpak` CLI is available on this system. */
export function hasFlatpakBinary(): boolean {
	return ["/usr/bin/flatpak", "/bin/flatpak"].some((path) => existsSync(path));
}

/** A Flatpak remote repository from either installation. */
export type FlatpakRemote = {
	name: string;
	title: string | null;
	url: string;
	homepage: string | null;
	priority: number;
	enabled: boolean;
	installation: FlatpakInstallation;
};

const REMOTE_COLUMNS = "name,title,url,options,priority,homepage";

/**
 * Parse one `flatpak remotes --columns=...` output line. When both system and
 * user installations are listed, the options column carries the installation
 * token (`system`/`user`) plus flag tokens such as `disabled`.
 */
function parseRemoteLine(line: string): FlatpakRemote | null {
	const parts = line.split("\t");
	const name = parts[0]?.trim();
	if (!name) return null;
	const options = (parts[3] ?? "")
		.split(",")
		.map((option) => option.trim().toLowerCase())
		.filter(Boolean);
	const homepage = parts[5]?.trim();
	return {
		name,
		title: parts[1]?.trim() || null,
		url: parts[2]?.trim() ?? "",
		enabled: !options.includes("disabled"),
		priority: Number.parseInt(parts[4] ?? "", 10) || 1,
		homepage: homepage && homepage !== "-" ? homepage : null,
		installation: options.includes("user") ? "user" : "system",
	};
}

/**
 * List all Flatpak remotes from the system and user installations, including
 * disabled ones. Returns an error message when the `flatpak` command fails.
 */
export async function fetchFlatpakRemotes(): Promise<{
	remotes: FlatpakRemote[];
	error: string | null;
}> {
	const result = await run(
		"flatpak",
		["remotes", "--show-disabled", `--columns=${REMOTE_COLUMNS}`],
		{ timeout: 30_000 },
	);
	if (!result.ok) {
		return {
			remotes: [],
			error:
				result.stderr.trim() ||
				`flatpak remotes failed (exit code ${result.code ?? "unknown"})`,
		};
	}
	const remotes: FlatpakRemote[] = [];
	for (const line of result.stdout.split("\n")) {
		const remote = parseRemoteLine(line);
		if (remote) remotes.push(remote);
	}
	return { remotes, error: null };
}

function installationFlag(installation: FlatpakInstallation): string {
	return installation === "user" ? "--user" : "--system";
}

/** Build the arguments to toggle a remote's enabled state. */
export function flatpakRemoteModifyArgs(
	remote: FlatpakRemote,
	enabled: boolean,
): string[] {
	return [
		"remote-modify",
		installationFlag(remote.installation),
		enabled ? "--enable" : "--disable",
		remote.name,
	];
}

/** Build the arguments to delete a remote. */
export function flatpakRemoteDeleteArgs(remote: FlatpakRemote): string[] {
	return [
		"remote-delete",
		installationFlag(remote.installation),
		"--force",
		remote.name,
	];
}

/** Build the arguments to add a remote repository. */
export function flatpakRemoteAddArgs(
	installation: FlatpakInstallation,
	name: string,
	url: string,
	title?: string,
): string[] {
	const args = [
		"remote-add",
		installationFlag(installation),
		"--if-not-exists",
	];
	if (title?.trim()) args.push(`--title=${title.trim()}`);
	args.push(name, url);
	return args;
}

/** Build the arguments to refresh appstream metadata for a remote. */
export function flatpakAppstreamArgs(
	installation: FlatpakInstallation,
	name: string,
): string[] {
	return ["update", "--appstream", installationFlag(installation), name];
}

/**
 * Run a Flatpak command. System-wide operations go through `pkexec`; user
 * operations run directly.
 */
export async function runFlatpakCommand(
	installation: FlatpakInstallation,
	args: string[],
	description?: string,
): Promise<OperationResult> {
	if (installation === "user") {
		const result = await run("flatpak", args, { timeout: 20 * 60 * 1000 });
		return {
			ok: result.ok,
			code: result.code,
			stdout: result.stdout,
			stderr: result.stderr,
			command: `flatpak ${args.join(" ")}`,
		};
	}
	return runPrivilegedCommand("flatpak", args, description);
}
