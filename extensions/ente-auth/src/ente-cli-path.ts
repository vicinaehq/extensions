import { accessSync, constants, statSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type CliPathOptions = {
	platform?: NodeJS.Platform;
	home?: string;
	pathEnv?: string;
	isExecutable?: (candidate: string) => boolean;
};

function isExecutableFile(candidate: string): boolean {
	try {
		if (!statSync(candidate).isFile()) return false;
		accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** Resolve the CLI without relying on the PATH inherited by a GUI-launched Vicinae. */
export function resolveEnteCliPath(
	configuredPath: string | undefined,
	options: CliPathOptions = {},
): string {
	const platform = options.platform ?? process.platform;
	const home = options.home ?? os.homedir();
	const pathApi = platform === "win32" ? path.win32 : path.posix;
	const configured = (configuredPath ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");

	// Honour explicit paths or custom executable names; do not silently override them.
	if (configured && configured !== "ente" && configured !== "ente.exe") {
		return configured.startsWith("~/")
			? pathApi.join(home, configured.slice(2))
			: configured;
	}

	const executable = platform === "win32" ? "ente.exe" : "ente";
	const extraDirectories =
		platform === "darwin"
			? [
					"/opt/homebrew/bin",
					"/usr/local/bin",
					pathApi.join(home, ".local", "bin"),
					pathApi.join(home, ".local", "opt", "ente-cli", "bin"),
				]
			: platform === "win32"
				? [
						pathApi.join(home, "AppData", "Local", "Microsoft", "WinGet", "Links"),
						pathApi.join(home, "scoop", "shims"),
					]
				: [
						pathApi.join(home, ".local", "bin"),
						pathApi.join(home, ".local", "opt", "ente-cli", "bin"),
						"/usr/local/bin",
						"/usr/bin",
					];
	const pathDirectories = (options.pathEnv ?? process.env.PATH ?? "")
		.split(pathApi.delimiter)
		.filter(Boolean);
	const canExecute = options.isExecutable ?? isExecutableFile;

	for (const directory of new Set([...pathDirectories, ...extraDirectories])) {
		const candidate = pathApi.join(directory, executable);
		if (canExecute(candidate)) return candidate;
	}

	// Preserve the existing helpful ENOENT error if no installation can be found.
	return executable;
}
