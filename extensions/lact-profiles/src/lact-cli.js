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

	const getProfiles = async () =>
		parseProfileList(await run(["cli", "profile", "list"]));
	const getCurrentProfile = async () =>
		parseCurrentProfile(await run(["cli", "profile", "get"]));
	/** @param {string} profile */
	const setProfile = async (profile) => {
		await run(["cli", "profile", "set", profile]);
	};
	/** @returns {Promise<ReturnType<typeof parseAutoSwitchStatus>>} */
	const getAutoSwitchStatus = async () => {
		try {
			return parseAutoSwitchStatus(
				await run(["cli", "profile", "auto-switch", "get"]),
			);
		} catch (error) {
			return /** @type {{available: false, error: string}} */ ({
				available: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	};
	/** @param {boolean} enabled */
	const setAutoSwitchEnabled = async (enabled) => {
		await run([
			"cli",
			"profile",
			"auto-switch",
			enabled ? "enable" : "disable",
		]);
	};
	/**
	 * LACT resets the active profile to Default when auto-switch is disabled.
	 * Restore the profile that was active before turning it off.
	 *
	 * @param {boolean} enabled
	 * @returns {Promise<{status: ReturnType<typeof parseAutoSwitchStatus>, currentProfile: string}>}
	 */
	const setAutoSwitchEnabledPreservingProfile = async (enabled) => {
		const previousProfile = enabled ? null : await getCurrentProfile();
		await setAutoSwitchEnabled(enabled);

		if (!enabled && previousProfile !== null && previousProfile !== "Default") {
			await setProfile(previousProfile);
		}

		const [status, currentProfile] = await Promise.all([
			getAutoSwitchStatus(),
			getCurrentProfile(),
		]);

		if (!status.available) throw new Error(status.error);
		if (status.enabled !== enabled) {
			throw new Error("LACT did not confirm the requested auto-switch state.");
		}
		if (!enabled && currentProfile !== previousProfile) {
			throw new Error(
				`Could not restore the previously active profile (${previousProfile}); LACT reports ${currentProfile}.`,
			);
		}

		return { status, currentProfile };
	};

	return {
		getProfiles,
		getCurrentProfile,
		setProfile,
		getAutoSwitchStatus,
		setAutoSwitchEnabledPreservingProfile,
	};
}

const defaultClient = createLactClient();

export const getProfiles = defaultClient.getProfiles;
export const getCurrentProfile = defaultClient.getCurrentProfile;
export const setProfile = defaultClient.setProfile;
export const getAutoSwitchStatus = defaultClient.getAutoSwitchStatus;
export const setAutoSwitchEnabledPreservingProfile =
	defaultClient.setAutoSwitchEnabledPreservingProfile;
