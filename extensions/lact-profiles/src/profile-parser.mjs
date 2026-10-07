/**
 * Parse LACT's newline-delimited profile list while preserving spaces in names.
 *
 * @param {string} output
 * @returns {string[]}
 */
export function parseProfileList(output) {
	const seen = new Set();

	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((profile) => {
			if (!profile || seen.has(profile)) return false;
			seen.add(profile);
			return true;
		});
}

/** @param {string} output */
export function parseCurrentProfile(output) {
	return output.trim();
}

/**
 * @param {string} output
 * @returns {boolean | null}
 */
export function parseAutoSwitchState(output) {
	const state = output.trim().toLowerCase();
	if (state === "enabled") return true;
	if (state === "disabled") return false;
	return null;
}

/**
 * Keep unsupported commands and unexpected output distinguishable from valid states.
 *
 * @param {string} output
 * @returns {{ available: true, enabled: boolean } | { available: false, error: string }}
 */
export function parseAutoSwitchStatus(output) {
	const enabled = parseAutoSwitchState(output);
	if (enabled !== null) return { available: true, enabled };

	const detail = output.trim();
	return {
		available: false,
		error: detail
			? `Unrecognized LACT auto-switch status: ${detail}`
			: "LACT returned no auto-switch status.",
	};
}
