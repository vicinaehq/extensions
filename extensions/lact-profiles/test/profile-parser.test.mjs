import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLactClient, runLact } from "../src/lact-cli.mjs";
import {
	parseAutoSwitchState,
	parseAutoSwitchStatus,
	parseCurrentProfile,
	parseProfileList,
} from "../src/profile-parser.mjs";

test("declares Vicinae's generated JavaScript bundle as CommonJS", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	);
	assert.equal(manifest.type, "commonjs");
});

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
		warning: null,
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
		warning: null,
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
		warning: null,
	});
});

test("does not confirm selection while auto-switch remains enabled", async () => {
	const responses = [
		{ stdout: "" },
		{ stdout: "Gaming\n" },
		{ stdout: "enabled\n" },
		{ stdout: "Gaming\n" },
		{ stdout: "enabled\n" },
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
		autoSwitchStatus: { available: true, enabled: true },
		error: "LACT still reports automatic switching enabled.",
		warning: null,
	});
});

test("reports a set-command error as a warning when readback confirms the state", async () => {
	const calls = [];
	const commandError = Object.assign(new Error("response lost"), { code: 1 });
	const responses = [
		{ error: commandError, stderr: "command response lost" },
		{ stdout: "Gaming\n" },
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
		warning: "command response lost",
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
		warning: null,
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

test("restores the active profile when disabling auto-switch reports an error", async () => {
	const calls = [];
	const disableError = Object.assign(new Error("response lost"), { code: 1 });
	const responses = [
		{ stdout: "Gaming\n" },
		{ error: disableError, stderr: "command response lost" },
		{ stdout: "" },
		{ stdout: "disabled\n" },
		{ stdout: "Gaming\n" },
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

	assert.deepEqual(await client.setAutoSwitchEnabledPreservingProfile(false), {
		status: { available: true, enabled: false },
		currentProfile: "Gaming",
		warning: "command response lost",
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

test("retries restoring the active profile after a transient failure", async () => {
	const calls = [];
	const restoreError = Object.assign(new Error("write response lost"), {
		code: 1,
	});
	const responses = [
		{ stdout: "Gaming\n" },
		{ stdout: "" },
		{ error: restoreError, stderr: "temporary restore failure" },
		{ stdout: "disabled\n" },
		{ stdout: "Default\n" },
		{ stdout: "" },
		{ stdout: "disabled\n" },
		{ stdout: "Gaming\n" },
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

	assert.deepEqual(await client.setAutoSwitchEnabledPreservingProfile(false), {
		status: { available: true, enabled: false },
		currentProfile: "Gaming",
		warning: "temporary restore failure",
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "disable"]],
			["lact", ["cli", "profile", "set", "Gaming"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "set", "Gaming"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
		],
	);
});

test("reports an unrecovered profile restore failure", async () => {
	const firstRestoreError = Object.assign(new Error("first failure"), {
		code: 1,
	});
	const retryRestoreError = Object.assign(new Error("retry failure"), {
		code: 1,
	});
	const responses = [
		{ stdout: "Gaming\n" },
		{ stdout: "" },
		{ error: firstRestoreError, stderr: "temporary restore failure" },
		{ stdout: "disabled\n" },
		{ stdout: "Default\n" },
		{ error: retryRestoreError, stderr: "profile restore failed" },
		{ stdout: "disabled\n" },
		{ stdout: "Default\n" },
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

	await assert.rejects(
		client.setAutoSwitchEnabledPreservingProfile(false),
		/Could not restore the previously active profile \(Gaming\); LACT reports Default\. Command errors: temporary restore failure; profile restore failed/,
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
		warning: null,
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
		warning: null,
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
