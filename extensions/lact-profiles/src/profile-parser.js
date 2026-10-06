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
