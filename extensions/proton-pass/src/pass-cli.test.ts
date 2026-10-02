import assert from "node:assert/strict";
import test from "node:test";
import { extractTotpCode, passwordArgs } from "./cli-contract";

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
