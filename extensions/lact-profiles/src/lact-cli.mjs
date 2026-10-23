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
	 * LACT selects Default when auto-switch is disabled. Verify that result and
	 * the switch status without restoring an earlier profile.
	 *
	 * @param {boolean} enabled
	 * @returns {Promise<{status: ReturnType<typeof parseAutoSwitchStatus>, currentProfile: string, warning: string | null}>}
	 */
	const setAutoSwitchEnabledAndRefresh = async (enabled) => {
		let commandError = null;
		try {
			await setAutoSwitchEnabled(enabled);
		} catch (error) {
			commandError = error instanceof Error ? error.message : String(error);
		}

		const readState = async () => {
			const [status, profileResult] = await Promise.all([
				getAutoSwitchStatus(),
				getCurrentProfile()
					.then((currentProfile) => ({ currentProfile, error: null }))
					.catch((error) => ({
						currentProfile: null,
						error: error instanceof Error ? error.message : String(error),
					})),
			]);
			return { status, profileResult };
		};
		/**
		 * @param {Awaited<ReturnType<typeof readState>>} state
		 */
		const getVerificationErrors = (state) => {
			const verificationErrors = [];
			if (!state.status.available) {
				verificationErrors.push(
					`Could not confirm automatic-switch status: ${state.status.error}`,
				);
			} else if (state.status.enabled !== enabled) {
				verificationErrors.push(
					`LACT reports automatic switching ${state.status.enabled ? "enabled" : "disabled"}; expected ${enabled ? "enabled" : "disabled"}.`,
				);
			}
			if (state.profileResult.currentProfile === null) {
				verificationErrors.push(
					`Could not read LACT's current profile: ${state.profileResult.error ?? "unknown error"}`,
				);
			} else if (!enabled && state.profileResult.currentProfile !== "Default") {
				verificationErrors.push(
					`Could not verify profile after disabling automatic switching: LACT reports ${state.profileResult.currentProfile}; expected Default.`,
				);
			}
			return verificationErrors;
		};

		let state = await readState();
		let verificationErrors = getVerificationErrors(state);
		if (verificationErrors.length > 0) {
			// Retry readback once for transient CLI/daemon errors; do not change the profile.
			state = await readState();
			verificationErrors = getVerificationErrors(state);
		}
		if (verificationErrors.length > 0) {
			if (commandError !== null) {
				verificationErrors.push(`Command error: ${commandError}`);
			}
			throw new Error(verificationErrors.join(" "));
		}
		if (
			!state.status.available ||
			state.profileResult.currentProfile === null
		) {
			throw new Error("LACT did not return verifiable profile-switch state.");
		}

		return {
			status: state.status,
			currentProfile: state.profileResult.currentProfile,
			warning: commandError,
		};
	};

	return {
		getProfiles,
		getCurrentProfile,
		setProfile,
		getAutoSwitchStatus,
		selectProfileAndRefresh,
		setAutoSwitchEnabledAndRefresh,
	};
}

const defaultClient = createLactClient();

export const getProfiles = defaultClient.getProfiles;
export const getCurrentProfile = defaultClient.getCurrentProfile;
export const setProfile = defaultClient.setProfile;
export const getAutoSwitchStatus = defaultClient.getAutoSwitchStatus;
export const selectProfileAndRefresh = defaultClient.selectProfileAndRefresh;
export const setAutoSwitchEnabledAndRefresh =
	defaultClient.setAutoSwitchEnabledAndRefresh;
