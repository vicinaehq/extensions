import assert from "node:assert/strict";
import test from "node:test";
import {
	extractTotpCode,
	parseScore,
	parseVaultColorPreference,
	passwordArgs,
	penaltyLabel,
	scoreArgs,
	typedFieldList,
	typedFields,
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
	// "Consecutive" actually means an adjacent repeated character.
	assert.equal(penaltyLabel("Consecutive"), "Contains repeated characters");
	assert.equal(
		penaltyLabel("ContainsCommonPassword"),
		"Contains a common password",
	);
	// Unknown keys are de-camel-cased rather than dropped.
	assert.equal(penaltyLabel("SomethingNew"), "Something New");
});

test("parses the vault colour preference", () => {
	assert.deepEqual(parseVaultColorPreference("Personal=green, Work=blue"), {
		personal: "green",
		work: "blue",
	});
	// Case-insensitive names, whitespace tolerated.
	assert.deepEqual(parseVaultColorPreference("  Home = Purple "), {
		home: "purple",
	});
});

test("ignores malformed vault colour entries", () => {
	assert.deepEqual(parseVaultColorPreference(undefined), {});
	assert.deepEqual(parseVaultColorPreference(""), {});
	// Unknown colour, missing colour, and missing name are all skipped.
	assert.deepEqual(parseVaultColorPreference("A=chartreuse, B, =red"), {});
	// A valid entry alongside invalid ones survives.
	assert.deepEqual(parseVaultColorPreference("Good=red, Bad=nope"), {
		good: "red",
	});
});

test("accepts hex colours in the vault colour preference", () => {
	assert.deepEqual(parseVaultColorPreference("Work=#1E90FF, Home=#abc"), {
		work: "#1e90ff",
		home: "#abc",
	});
	// Malformed hex is rejected; named colours still pass alongside it.
	assert.deepEqual(parseVaultColorPreference("A=#12, B=blue"), {
		b: "blue",
	});
});

test("extracts credit-card fields from a typed content block", () => {
	// Mirrors the pass-cli CreditCardItem proto field names.
	const fields = typedFields(
		"credit_card",
		{
			cardholder_name: "Cristian Radoi",
			card_type: "Visa",
			number: "4111111111111111",
			verification_number: "123",
			expiration_date: "12/2027",
			pin: "0000",
			sections: [{ name: "ignored" }],
		},
		undefined,
	);
	assert.deepEqual(fields, [
		{
			title: "Cardholder",
			value: "Cristian Radoi",
			hidden: false,
			copy: false,
		},
		{ title: "Card type", value: "Visa", hidden: false, copy: false },
		{
			title: "Card number",
			value: "4111111111111111",
			hidden: true,
			copy: true,
		},
		{ title: "Security code", value: "123", hidden: true, copy: true },
		{ title: "Expiry date", value: "12/2027", hidden: false, copy: true },
		{ title: "PIN", value: "0000", hidden: true, copy: true },
	]);
});

test("marks only useful typed fields as copyable", () => {
	const wifi = typedFields(
		"wifi",
		{ ssid: "HomeNet", password: "hunter2", security: "WPA2" },
		undefined,
	);
	assert.deepEqual(wifi, [
		{ title: "Network name", value: "HomeNet", hidden: false, copy: true },
		{ title: "Password", value: "hunter2", hidden: true, copy: true },
		{ title: "Security", value: "WPA2", hidden: false, copy: false },
	]);
});

test("labels unknown typed fields by de-snake-casing", () => {
	assert.deepEqual(typedFieldList({ foo_bar: "baz" }), [
		{ title: "Foo Bar", value: "baz", hidden: false, copy: false },
	]);
	// Empty, null and nested values are dropped.
	assert.deepEqual(
		typedFieldList({ a: "", b: null, nested: { x: 1 }, arr: [1] }),
		[],
	);
});

test("suppresses the field block for logins and notes", () => {
	assert.equal(
		typedFields("login", { password: "x" }, { username: "u" }),
		undefined,
	);
	assert.equal(typedFields("note", { note: "text" }, undefined), undefined);
	// A login with no Login block still falls through to generic fields.
	assert.deepEqual(typedFields("login", { foo: "bar" }, undefined), [
		{ title: "Foo", value: "bar", hidden: false, copy: false },
	]);
});
