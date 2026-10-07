import { execFile } from "node:child_process";
import {
	parseAutoSwitchStatus,
	parseCurrentProfile,
	parseProfileList,
} from "./profile-parser.mjs";

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
	/**
	 * Select a profile, then reconcile the displayed state even if a command or
	 * its first readback fails after the daemon has already applied the change.
	 *
	 * @param {string} profile
	 * @returns {Promise<{currentProfile: string | null, autoSwitchStatus: ReturnType<typeof parseAutoSwitchStatus>, error: string | null, warning: string | null}>}
	 */
	const selectProfileAndRefresh = async (profile) => {
		let commandError = null;
		try {
			await setProfile(profile);
		} catch (error) {
			commandError = error instanceof Error ? error.message : String(error);
		}

		const readState = async () => {
			const [profileResult, autoSwitchStatus] = await Promise.all([
				getCurrentProfile()
					.then((currentProfile) => ({ currentProfile, error: null }))
					.catch((error) => ({
						currentProfile: null,
						error: error instanceof Error ? error.message : String(error),
					})),
				getAutoSwitchStatus(),
			]);
			return { ...profileResult, autoSwitchStatus };
		};

		let state = await readState();
		if (
			commandError ||
			state.error !== null ||
			state.currentProfile !== profile ||
			!state.autoSwitchStatus.available ||
			state.autoSwitchStatus.enabled
		) {
			state = await readState();
		}

		const finalStateVerified =
			state.currentProfile === profile &&
			state.autoSwitchStatus.available &&
			!state.autoSwitchStatus.enabled;
		const errors = [];
		if (commandError && !finalStateVerified) errors.push(commandError);
		if (state.currentProfile === null) {
			errors.push(
				`Could not read LACT's current profile: ${state.error ?? "unknown error"}`,
			);
		} else if (state.currentProfile !== profile) {
			errors.push(
				`Requested “${profile}”; LACT reports “${state.currentProfile}”.`,
			);
		}
		if (!state.autoSwitchStatus.available) {
			errors.push(
				`Could not confirm automatic-switch status: ${state.autoSwitchStatus.error}`,
			);
		} else if (state.autoSwitchStatus.enabled) {
			errors.push("LACT still reports automatic switching enabled.");
		}
		const error = errors.length > 0 ? errors.join(" ") : null;

		return {
			currentProfile: state.currentProfile,
			autoSwitchStatus: state.autoSwitchStatus,
			error,
			warning: finalStateVerified ? commandError : null,
		};
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
		let toggleError = null;
		try {
			await setAutoSwitchEnabled(enabled);
		} catch (error) {
			toggleError = error instanceof Error ? error.message : String(error);
		}

		let restoreError = null;
		if (!enabled && previousProfile !== null && previousProfile !== "Default") {
			try {
				await setProfile(previousProfile);
			} catch (error) {
				restoreError = error instanceof Error ? error.message : String(error);
			}
		}

		const [status, currentProfile] = await Promise.all([
			getAutoSwitchStatus(),
			getCurrentProfile(),
		]);

		const verificationErrors = [];
		if (!status.available) {
			verificationErrors.push(
				`Could not confirm automatic-switch status: ${status.error}`,
			);
		} else if (status.enabled !== enabled) {
			verificationErrors.push(
				`LACT reports automatic switching ${status.enabled ? "enabled" : "disabled"}; expected ${enabled ? "enabled" : "disabled"}.`,
			);
		}
		if (!enabled && currentProfile !== previousProfile) {
			verificationErrors.push(
				`Could not restore the previously active profile (${previousProfile}); LACT reports ${currentProfile}.`,
			);
		}
		if (verificationErrors.length > 0) {
			const commandErrors = [toggleError, restoreError].filter(Boolean);
			if (commandErrors.length > 0) {
				verificationErrors.push(`Command errors: ${commandErrors.join("; ")}`);
			}
			throw new Error(verificationErrors.join(" "));
		}

		return { status, currentProfile };
	};

	return {
		getProfiles,
		getCurrentProfile,
		setProfile,
		getAutoSwitchStatus,
		selectProfileAndRefresh,
		setAutoSwitchEnabledPreservingProfile,
	};
}

const defaultClient = createLactClient();

export const getProfiles = defaultClient.getProfiles;
export const getCurrentProfile = defaultClient.getCurrentProfile;
export const setProfile = defaultClient.setProfile;
export const getAutoSwitchStatus = defaultClient.getAutoSwitchStatus;
export const selectProfileAndRefresh = defaultClient.selectProfileAndRefresh;
export const setAutoSwitchEnabledPreservingProfile =
	defaultClient.setAutoSwitchEnabledPreservingProfile;
