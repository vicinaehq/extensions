import assert from "node:assert/strict";
import test from "node:test";
import {
	parseAutoSwitchState,
	parseAutoSwitchStatus,
	parseCurrentProfile,
	parseProfileList,
} from "../src/profile-parser.js";

test("parses newline-delimited profiles and preserves spaces in names", () => {
	assert.deepEqual(parseProfileList("Default\nGaming\nQuiet Undervolt\n"), [
		"Default",
		"Gaming",
		"Quiet Undervolt",
	]);
});

test("trims blank lines and ignores duplicate profile names", () => {
	assert.deepEqual(parseProfileList("\r\n Default \r\nGaming\r\nDefault\r\n"), [
		"Default",
		"Gaming",
	]);
});

test("parses the active profile without changing its internal spacing", () => {
	assert.equal(parseCurrentProfile("  Quiet  Undervolt\n"), "Quiet  Undervolt");
});

test("parses documented automatic-switch status values", () => {
	assert.equal(parseAutoSwitchState("enabled\n"), true);
	assert.equal(parseAutoSwitchState("DISABLED\n"), false);
	assert.equal(parseAutoSwitchState("unknown"), null);
});

test("surfaces unrecognized automatic-switch output instead of masking it", () => {
	assert.deepEqual(parseAutoSwitchStatus("enabled\n"), {
		available: true,
		enabled: true,
	});
	assert.deepEqual(parseAutoSwitchStatus("unknown command\n"), {
		available: false,
		error: "Unrecognized LACT auto-switch status: unknown command",
	});
	assert.deepEqual(parseAutoSwitchStatus("\n"), {
		available: false,
		error: "LACT returned no auto-switch status.",
	});
});
