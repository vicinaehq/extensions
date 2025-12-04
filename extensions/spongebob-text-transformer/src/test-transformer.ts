import { toSpongebobCase } from "./utils";

const input = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";

const result = toSpongebobCase(input);

console.log(`Input:    "${input}"`);
console.log(`Result:   "${result}"`);

// Verify that the casing is actually randomized
function verifyCasingIsRandomized(original: string, transformed: string): boolean {
	if (original.length !== transformed.length) {
		return false;
	}

	let hasLowerCase = false;
	let hasUpperCase = false;
	let hasVariation = false;

	for (let i = 0; i < original.length; i++) {
		const originalChar = original[i];
		const transformedChar = transformed[i];

		// Skip non-alphabetic characters
		if (!/[a-zA-Z]/.test(originalChar)) {
			continue;
		}

		if (transformedChar === transformedChar.toLowerCase()) {
			hasLowerCase = true;
		}
		if (transformedChar === transformedChar.toUpperCase()) {
			hasUpperCase = true;
		}

		// Check if there's variation (not all same case)
		if (i > 0 && /[a-zA-Z]/.test(original[i - 1])) {
			const prevChar = transformed[i - 1];
			if (
				(prevChar === prevChar.toLowerCase() && transformedChar === transformedChar.toUpperCase()) ||
				(prevChar === prevChar.toUpperCase() && transformedChar === transformedChar.toLowerCase())
			) {
				hasVariation = true;
			}
		}
	}

	return hasLowerCase && hasUpperCase && hasVariation;
}

const isRandomized = verifyCasingIsRandomized(input, result);

console.log(`\nTest Result: ${isRandomized ? "✓ PASS" : "✗ FAIL"}`);
console.log(`Has mixed case: ${isRandomized ? "Yes" : "No"}`);
console.log(`Casing is properly randomized: ${isRandomized ? "Yes" : "No"}`);

