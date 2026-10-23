/**
 * Keep the settings-only row out of the initial list model. Otherwise it can
 * become the selected row before profiles arrive and remain selected afterward.
 *
 * @param {boolean} isLoading
 * @returns {boolean}
 */
export function shouldRenderAutoSwitchSection(isLoading) {
	return !isLoading;
}

/**
 * Prevents overlapping operations that mutate LACT profile state.
 *
 * @returns {(operation: () => Promise<void>) => Promise<boolean>}
 */
export function createInFlightMutationGuard() {
	let inFlight = false;
	return async (operation) => {
		if (inFlight) return false;
		inFlight = true;
		try {
			await operation();
			return true;
		} finally {
			inFlight = false;
		}
	};
}
