const META_PREFIXES = [
	/^Sure,? /i,
	/^Sure thing,? /i,
	/^Here('s| is) /i,
	/^Here's your /i,
	/^The (translation|summary|explanation|enhanced text|dictionary entry) (is|:) /i,
	/^I (have |will |would |can |could |'ve ).*/i,
	/^Of course,? /i,
	/^Certainly,? /i,
	/^Let me /i,
];

/**
 * Strip common AI meta-commentary prefixes from output.
 * This handles the cases where model ignores "no meta-commentary" rules.
 */
function stripMetaPrefix(output: string): string {
	let cleaned = output.trim();
	for (const pattern of META_PREFIXES) {
		cleaned = cleaned.replace(pattern, "");
	}
	return cleaned.trim();
}

/**
 * Restore masked URLs and code blocks back into the output.
 */
function restoreMasks(output: string, masks: Map<string, string>): string {
	let result = output;
	for (const [id, original] of masks) {
		result = result.split(id).join(original);
	}
	return result;
}

/**
 * Full postprocessing pipeline: restore masks → strip meta → trim.
 */
export function postprocessOutput(
	output: string,
	masks: Map<string, string>,
): string {
	const restored = restoreMasks(output, masks);
	const stripped = stripMetaPrefix(restored);
	return stripped.trim();
}
