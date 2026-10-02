import assert from "node:assert/strict";
import test from "node:test";
import {
	extractTotpCode,
	parseScore,
	passwordArgs,
	penaltyLabel,
	scoreArgs,
} from "./cli-contract";

test("builds the exact random-password CLI contract", () => {
	assert.deepEqual(
		passwordArgs({
			type: "random",
			length: 24,
			includeNumbers: true,
			includeUppercase: false,
			includeSymbols: true,
		}),
		[
			"password",
			"generate",
			"random",
			"--length",
			"24",
			"--numbers",
			"true",
			"--uppercase",
			"false",
			"--symbols",
			"true",
		],
	);
});

test("builds the exact passphrase CLI contract", () => {
	assert.deepEqual(
		passwordArgs({
			type: "passphrase",
			words: 5,
			separator: "numbers-and-symbols",
			capitalize: false,
			includeNumbers: true,
		}),
		[
			"password",
			"generate",
			"passphrase",
			"--count",
			"5",
			"--separator",
			"numbers-and-symbols",
			"--capitalise",
			"false",
			"--numbers",
			"true",
		],
	);
});

test("extracts the primary TOTP from wrapped output", () => {
	assert.equal(
		extractTotpCode({ totps: { totp: "123456", recovery: "999999" } }),
		"123456",
	);
});

test("does not mistake recovery codes for the primary TOTP", () => {
	assert.equal(
		extractTotpCode({ recovery: "999999", backup: "888888" }),
		undefined,
	);
});

test("accepts flat TOTP output and ignores malformed output", () => {
	assert.equal(extractTotpCode({ primary: "111222" }), "111222");
	assert.equal(extractTotpCode(null), undefined);
	assert.equal(extractTotpCode({}), undefined);
});

test("rejects TOTP URIs and non-code strings", () => {
	assert.equal(
		extractTotpCode({ totp: "otpauth://totp/example?secret=REDACTED" }),
		undefined,
	);
	assert.equal(extractTotpCode({ "TOTP 2": "123456" }), "123456");
	assert.equal(
		extractTotpCode({ "TOTP 1": "123456", "TOTP 2": "654321" }),
		undefined,
	);
});

test("builds the exact password-score CLI contract", () => {
	assert.deepEqual(scoreArgs("hunter2"), [
		"password",
		"score",
		"hunter2",
		"--output",
		"json",
	]);
});

test("parses the real pass-cli score JSON shape", () => {
	assert.deepEqual(
		parseScore({
			numeric_score: 100,
			password_score: "Strong",
			penalties: [],
		}),
		{ numericScore: 100, label: "Strong", penalties: [] },
	);
	assert.deepEqual(
		parseScore({
			numeric_score: 2.25,
			password_score: "Vulnerable",
			penalties: ["NoNumbers", "Short"],
		}),
		{
			numericScore: 2.25,
			label: "Vulnerable",
			penalties: ["NoNumbers", "Short"],
		},
	);
});

test("coerces malformed score output into safe defaults", () => {
	assert.deepEqual(parseScore(null), undefined);
	// Unknown label and non-numeric score fall back without throwing.
	assert.deepEqual(parseScore({ password_score: "Mystery", penalties: 7 }), {
		numericScore: 0,
		label: "Unknown",
		penalties: [],
	});
});

test("maps known penalty keys to readable text", () => {
	assert.equal(penaltyLabel("NoNumbers"), "No numbers");
	assert.equal(
		penaltyLabel("ContainsCommonPassword"),
		"Contains a common password",
	);
	// Unknown keys are de-camel-cased rather than dropped.
	assert.equal(penaltyLabel("SomethingNew"), "Something New");
});
