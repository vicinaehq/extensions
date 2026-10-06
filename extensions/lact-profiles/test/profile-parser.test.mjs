import assert from "node:assert/strict";
import test from "node:test";
import { createLactClient, runLact } from "../src/lact-cli.js";
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

test("runs LACT with direct argv and a bounded timeout", async () => {
	let invocation;
	const profile = "Quiet; $(touch /tmp/should-not-run)";
	const output = await runLact(
		["cli", "profile", "set", profile],
		(command, args, options, callback) => {
			invocation = { command, args, options };
			callback(null, "Quiet\n", "");
		},
	);

	assert.equal(output, "Quiet");
	assert.equal(invocation.command, "lact");
	assert.deepEqual(invocation.args, ["cli", "profile", "set", profile]);
	assert.equal(invocation.options.shell, undefined);
	assert.equal(invocation.options.timeout, 10_000);
});

test("maps profile and auto-switch reads to documented CLI arguments", async () => {
	const calls = [];
	const responses = ["Default\nGaming\n", "Gaming\n", "", "enabled\n"];
	const executeFile = (command, args, options, callback) => {
		calls.push({ command, args: [...args], options });
		callback(null, responses.shift(), "");
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.getProfiles(), ["Default", "Gaming"]);
	assert.equal(await client.getCurrentProfile(), "Gaming");
	await client.setProfile("Quiet Undervolt");
	assert.deepEqual(await client.getAutoSwitchStatus(), {
		available: true,
		enabled: true,
	});

	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "list"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "set", "Quiet Undervolt"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
		],
	);
});

test("refreshes state after a transient profile readback failure", async () => {
	const calls = [];
	const responses = [
		{ stdout: "" },
		{
			error: Object.assign(new Error("readback failed"), { code: 1 }),
			stderr: "temporarily unavailable",
		},
		{ stdout: "disabled\n" },
		{ stdout: "Gaming\n" },
		{ stdout: "disabled\n" },
	];
	const executeFile = (command, args, _options, callback) => {
		calls.push({ command, args: [...args] });
		const response = responses.shift();
		callback(
			response.error ?? null,
			response.stdout ?? "",
			response.stderr ?? "",
		);
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.selectProfileAndRefresh("Gaming"), {
		currentProfile: "Gaming",
		autoSwitchStatus: { available: true, enabled: false },
		error: null,
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "set", "Gaming"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
		],
	);
});

test("retries an unavailable auto-switch status after profile selection", async () => {
	const calls = [];
	const statusError = Object.assign(new Error("status read failed"), {
		code: 1,
	});
	const responses = [
		{ stdout: "" },
		{ stdout: "Gaming\n" },
		{ error: statusError, stderr: "temporarily unavailable" },
		{ stdout: "Gaming\n" },
		{ stdout: "disabled\n" },
	];
	const executeFile = (command, args, _options, callback) => {
		calls.push({ command, args: [...args] });
		const response = responses.shift();
		callback(
			response.error ?? null,
			response.stdout ?? "",
			response.stderr ?? "",
		);
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.selectProfileAndRefresh("Gaming"), {
		currentProfile: "Gaming",
		autoSwitchStatus: { available: true, enabled: false },
		error: null,
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "set", "Gaming"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
		],
	);
});

test("does not confirm selection without automatic-switch status", async () => {
	const statusError = Object.assign(new Error("status read failed"), {
		code: 1,
	});
	const responses = [
		{ stdout: "" },
		{ stdout: "Gaming\n" },
		{ error: statusError, stderr: "temporarily unavailable" },
		{ stdout: "Gaming\n" },
		{ error: statusError, stderr: "temporarily unavailable" },
	];
	const executeFile = (_command, _args, _options, callback) => {
		const response = responses.shift();
		callback(
			response.error ?? null,
			response.stdout ?? "",
			response.stderr ?? "",
		);
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.selectProfileAndRefresh("Gaming"), {
		currentProfile: "Gaming",
		autoSwitchStatus: {
			available: false,
			error: "temporarily unavailable",
		},
		error: "Could not confirm automatic-switch status: temporarily unavailable",
	});
});

test("disabling auto-switch restores the previously active profile", async () => {
	const calls = [];
	const responses = ["Gaming\n", "", "", "disabled\n", "Gaming\n"];
	const executeFile = (command, args, _options, callback) => {
		calls.push({ command, args: [...args] });
		callback(null, responses.shift(), "");
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.setAutoSwitchEnabledPreservingProfile(false), {
		status: { available: true, enabled: false },
		currentProfile: "Gaming",
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "disable"]],
			["lact", ["cli", "profile", "set", "Gaming"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
		],
	);
});

test("disabling auto-switch leaves the Default profile in place", async () => {
	const calls = [];
	const responses = ["Default\n", "", "disabled\n", "Default\n"];
	const executeFile = (command, args, _options, callback) => {
		calls.push({ command, args: [...args] });
		callback(null, responses.shift(), "");
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.setAutoSwitchEnabledPreservingProfile(false), {
		status: { available: true, enabled: false },
		currentProfile: "Default",
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "disable"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
		],
	);
});

test("enabling auto-switch confirms the resulting status and profile", async () => {
	const calls = [];
	const responses = ["", "enabled\n", "Gaming\n"];
	const executeFile = (command, args, _options, callback) => {
		calls.push({ command, args: [...args] });
		callback(null, responses.shift(), "");
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.setAutoSwitchEnabledPreservingProfile(true), {
		status: { available: true, enabled: true },
		currentProfile: "Gaming",
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "auto-switch", "enable"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
		],
	);
});

test("preserves actionable subprocess errors for profiles and auto-switch status", async () => {
	const executeFile = (_command, _args, _options, callback) => {
		callback(
			Object.assign(new Error("LACT command failed"), { code: 1 }),
			"",
			"lactd socket permission denied",
		);
	};
	const client = createLactClient(executeFile);

	await assert.rejects(client.getProfiles(), /lactd socket permission denied/);
	assert.deepEqual(await client.getAutoSwitchStatus(), {
		available: false,
		error: "lactd socket permission denied",
	});
});
