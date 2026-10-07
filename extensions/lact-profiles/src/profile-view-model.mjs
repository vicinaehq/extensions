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
