import assert from "node:assert/strict";
import { test } from "node:test";
import { describeWarmth, parseWarmth, warmthArgs } from "./warmth.ts";

test("parses a strength", () => {
	assert.deepEqual(parseWarmth("0.8"), { strength: 0.8 });
	assert.deepEqual(parseWarmth(" 1 "), { strength: 1 });
	assert.deepEqual(parseWarmth("0"), { strength: 0 });
});

test("parses a Kelvin target", () => {
	assert.deepEqual(parseWarmth("3000"), { kelvin: 3000 });
	assert.deepEqual(parseWarmth("3000K"), { kelvin: 3000 });
	assert.deepEqual(parseWarmth("1900k"), { kelvin: 1900 });
	assert.deepEqual(parseWarmth("6500"), { kelvin: 6500 });
});

test("rejects out-of-range and junk input instead of clamping", () => {
	for (const input of ["", "   ", "abc", "1.5", "50", "7000", "6501", "6499.5", "-1", "0.5k"]) {
		assert.equal(parseWarmth(input), null, `expected null for ${JSON.stringify(input)}`);
	}
});

test("builds the CLI arguments", () => {
	assert.deepEqual(warmthArgs({ strength: 0.8 }), ["set", "warmth", "0.8"]);
	assert.deepEqual(warmthArgs({ kelvin: 3000 }), ["set", "warmth", "--kelvin", "3000"]);
});

test("describes a value for HUD feedback", () => {
	assert.equal(describeWarmth({ strength: 0.86 }), "86%");
	assert.equal(describeWarmth({ kelvin: 3000 }), "3000K");
});