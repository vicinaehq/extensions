// @ts-nocheck

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseRecentIconsJson } = require("../src/schemas/recent-icons-schema");

test("recent icons parser accepts valid payload", () => {
	const value = JSON.stringify([
		{
			id: "md-home",
			char: "x",
			code: "f015",
			hexCode: "0xF015",
			htmlEntity: "&#xf015;",
			displayName: "Home",
			nerdFontId: "nf-md-home",
			packLabel: "Material Design",
			iconPath: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
		},
	]);

	const result = parseRecentIconsJson(value);
	assert.equal(result.length, 1);
	assert.equal(result[0].id, "md-home");
});

test("recent icons parser rejects malformed JSON", () => {
	assert.deepEqual(parseRecentIconsJson("{broken"), []);
});

test("recent icons parser rejects invalid shape", () => {
	const invalid = JSON.stringify([
		{
			id: "md-home",
			char: "x",
			code: "f015",
			hexCode: "0xF015",
			htmlEntity: "&#xf015;",
			displayName: "Home",
			nerdFontId: "nf-md-home",
			packLabel: "Material Design",
			iconPath: { source: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E" },
		},
	]);

	assert.deepEqual(parseRecentIconsJson(invalid), []);
});
