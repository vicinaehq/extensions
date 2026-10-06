import { execFile } from "node:child_process";
import {
	parseAutoSwitchStatus,
	parseCurrentProfile,
	parseProfileList,
} from "./profile-parser.js";

const COMMAND_TIMEOUT_MS = 10_000;

/**
 * @param {string[]} args
 * @param {typeof execFile} [executeFile]
 * @returns {Promise<string>}
 */
export function runLact(args, executeFile = execFile) {
	return new Promise((resolve, reject) => {
		executeFile(
			"lact",
			args,
			{ encoding: "utf8", maxBuffer: 1024 * 1024, timeout: COMMAND_TIMEOUT_MS },
			(error, stdout, stderr) => {
				if (error) {
					const message =
						error.code === "ENOENT"
							? "The `lact` command was not found on PATH."
							: stderr.trim() || error.message;
					reject(new Error(message));
					return;
				}

				resolve(stdout.trim());
			},
		);
	});
}

/**
 * Construct a client around the LACT CLI. The executor parameter keeps command
 * mapping and error handling testable without a running lactd service.
 *
 * @param {typeof execFile} [executeFile]
 */
export function createLactClient(executeFile = execFile) {
	/** @param {string[]} args */
	const run = (args) => runLact(args, executeFile);

	return {
		async getProfiles() {
			return parseProfileList(await run(["cli", "profile", "list"]));
		},

		async getCurrentProfile() {
			return parseCurrentProfile(await run(["cli", "profile", "get"]));
		},

		/** @param {string} profile */
		async setProfile(profile) {
			await run(["cli", "profile", "set", profile]);
		},

		/** @returns {Promise<ReturnType<typeof parseAutoSwitchStatus>>} */
		async getAutoSwitchStatus() {
			try {
				return parseAutoSwitchStatus(
					await run(["cli", "profile", "auto-switch", "get"]),
				);
			} catch (error) {
				return {
					available: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},

		/** @param {boolean} enabled */
		async setAutoSwitchEnabled(enabled) {
			await run([
				"cli",
				"profile",
				"auto-switch",
				enabled ? "enable" : "disable",
			]);
		},
	};
}

const defaultClient = createLactClient();

export const getProfiles = defaultClient.getProfiles;
export const getCurrentProfile = defaultClient.getCurrentProfile;
export const setProfile = defaultClient.setProfile;
export const getAutoSwitchStatus = defaultClient.getAutoSwitchStatus;
export const setAutoSwitchEnabled = defaultClient.setAutoSwitchEnabled;
