import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import {
	closeMainWindow,
	getPreferenceValues,
	type LaunchProps,
	PopToRootType,
	showHUD,
} from "@vicinae/api";
import { findCommand, type PaneruCommand } from "./commands";

interface Preferences {
	paneruPath?: string;
}

// Launchers started from the GUI often inherit a minimal PATH that lacks
// Homebrew/Cargo/Nix, so probe the usual install locations as well.
const FALLBACK_DIRS = [
	"/opt/homebrew/bin",
	"/usr/local/bin",
	join(homedir(), ".cargo/bin"),
	join(homedir(), ".nix-profile/bin"),
	"/run/current-system/sw/bin",
	"/etc/profiles/per-user/" + (process.env.USER ?? "") + "/bin",
];

let cachedBinary: string | undefined;

function isExecutable(path: string): boolean {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function resolvePaneru(): string {
	const configured = getPreferenceValues<Preferences>().paneruPath?.trim();
	if (configured) return configured.replace(/^~(?=\/|$)/, homedir());
	if (cachedBinary) return cachedBinary;

	const dirs = [...(process.env.PATH ?? "").split(delimiter), ...FALLBACK_DIRS];
	for (const dir of dirs) {
		if (!dir) continue;
		const candidate = join(dir, "paneru");
		if (isExecutable(candidate)) {
			cachedBinary = candidate;
			return candidate;
		}
	}
	// Let execFile produce a clear ENOENT if it really is missing.
	return "paneru";
}

export function sendCommand(argv: string[]): Promise<string> {
	const binary = resolvePaneru();
	return new Promise((resolve, reject) => {
		execFile(
			binary,
			["send-cmd", ...argv],
			{ timeout: 5000 },
			(error, stdout, stderr) => {
				if (!error) return resolve(stdout.trim());
				const err = error as NodeJS.ErrnoException;
				if (err.code === "ENOENT") {
					return reject(
						new Error(
							`Couldn't find the paneru binary (${binary}). Set its path in the extension preferences.`,
						),
					);
				}
				const detail = stderr.trim() || stdout.trim() || error.message;
				reject(new Error(cleanPaneruError(detail)));
			},
		);
	});
}

/** Turns `Error: Generic("invalid command '[\"x\"]'")` into `invalid command '["x"]'`. */
function cleanPaneruError(message: string): string {
	const stripped = message.replace(/^Error:\s*/, "");
	const generic = /^\w+\("(.*)"\)$/s.exec(stripped);
	return generic ? generic[1].replace(/\\"/g, '"') : stripped;
}

/** Validates a 1-based column/workspace number entered as a command argument. */
export function parseNumberArg(value: unknown): string {
	const text = String(value ?? "").trim();
	if (!/^\d+$/.test(text) || Number(text) < 1) {
		throw new Error(`Expected a number of 1 or more, got "${text}"`);
	}
	return String(Number(text));
}

export function buildArgv(command: PaneruCommand, number?: unknown): string[] {
	return command.numberArg
		? [...command.argv, parseNumberArg(number)]
		: command.argv;
}

const CLOSE_OPTIONS = {
	clearRootSearch: false,
	popToRootType: PopToRootType.Default,
};

/**
 * Hides Vicinae (so focus returns to the window Paneru should act on), then
 * runs the command. Errors surface as a HUD since the launcher is closed.
 */
export async function runCommand(
	command: PaneruCommand,
	number?: unknown,
): Promise<void> {
	// Keep the search text and defer to the user's pop-to-root preference, so
	// reopening Vicinae can land back on the same command for quick repeats.
	// showHUD also closes the window, so it gets the same options.
	await closeMainWindow(CLOSE_OPTIONS);
	try {
		const argv = buildArgv(command, number);
		// Give macOS a moment to hand focus back to the previous app.
		await new Promise((r) => setTimeout(r, 60));
		await sendCommand(argv);
		if (command.successHud) await showHUD(command.successHud, CLOSE_OPTIONS);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await showHUD(`Paneru: ${message}`, CLOSE_OPTIONS);
	}
}

/** Builds the default export for a generated `no-view` entrypoint. */
export function noViewCommand(name: string) {
	const command = findCommand(name);
	return async (props: LaunchProps<{ arguments: { number?: string } }>) => {
		await runCommand(command, props.arguments?.number);
	};
}
