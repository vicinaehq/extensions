import { execFile } from "node:child_process";
import {
	parseAutoSwitchState,
	parseCurrentProfile,
	parseProfileList,
} from "./profile-parser.js";

const COMMAND_TIMEOUT_MS = 10_000;

function runLact(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			"lact",
			args,
			{ encoding: "utf8", maxBuffer: 1024 * 1024, timeout: COMMAND_TIMEOUT_MS },
			(error, stdout, stderr) => {
				if (error) {
					const processError = error as NodeJS.ErrnoException;
					const details = stderr.trim();
					const message =
						processError.code === "ENOENT"
							? "The `lact` command was not found on PATH."
							: details || error.message;
					reject(new Error(message));
					return;
				}

				resolve(stdout.trim());
			},
		);
	});
}

export async function getProfiles(): Promise<string[]> {
	return parseProfileList(await runLact(["cli", "profile", "list"]));
}

export async function getCurrentProfile(): Promise<string> {
	return parseCurrentProfile(await runLact(["cli", "profile", "get"]));
}

export async function setProfile(profile: string): Promise<void> {
	await runLact(["cli", "profile", "set", profile]);
}

export async function getAutoSwitchEnabled(): Promise<boolean | null> {
	try {
		const output = await runLact(["cli", "profile", "auto-switch", "get"]);
		return parseAutoSwitchState(output);
	} catch {
		// Keep profile switching available on older LACT versions without this command.
		return null;
	}
}

export async function setAutoSwitchEnabled(enabled: boolean): Promise<void> {
	await runLact([
		"cli",
		"profile",
		"auto-switch",
		enabled ? "enable" : "disable",
	]);
}
