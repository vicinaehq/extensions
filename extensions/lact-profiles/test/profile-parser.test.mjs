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
import {
	createInFlightMutationGuard,
	shouldRenderAutoSwitchSection,
} from "../src/profile-view-model.mjs";

test("declares Vicinae's generated JavaScript bundle as CommonJS", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	);
	assert.equal(manifest.type, "commonjs");
});

test("keeps the command title distinct from its extension title", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	);
	assert.notEqual(manifest.commands[0].title, manifest.title);
});

test("keeps the settings row out of the initial profile selection", () => {
	assert.equal(shouldRenderAutoSwitchSection(true), false);
	assert.equal(shouldRenderAutoSwitchSection(false), true);
});

test("serializes profile mutations and releases the guard after completion", async () => {
	const runExclusive = createInFlightMutationGuard();
	let releaseFirst;
	const firstOperationCanFinish = new Promise((resolve) => {
		releaseFirst = resolve;
	});
	let operationCount = 0;

	const first = runExclusive(async () => {
		operationCount += 1;
		await firstOperationCanFinish;
	});
	assert.equal(
		await runExclusive(async () => {
			operationCount += 1;
		}),
		false,
	);
	assert.equal(operationCount, 1);

	releaseFirst();
	assert.equal(await first, true);
	assert.equal(
		await runExclusive(async () => {
			operationCount += 1;
		}),
		true,
	);
	assert.equal(operationCount, 2);
});

test("releases the mutation guard after an operation rejects", async () => {
	const runExclusive = createInFlightMutationGuard();
	await assert.rejects(
		runExclusive(async () => {
			throw new Error("mutation failed");
		}),
		/mutation failed/,
	);
	assert.equal(await runExclusive(async () => {}), true);
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

test("disabling auto-switch leaves LACT's Default profile active", async () => {
	const calls = [];
	const responses = ["", "disabled\n", "Default\n"];
	const executeFile = (command, args, _options, callback) => {
		calls.push({ command, args: [...args] });
		callback(null, responses.shift(), "");
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.setAutoSwitchEnabledAndRefresh(false), {
		status: { available: true, enabled: false },
		currentProfile: "Default",
		warning: null,
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "auto-switch", "disable"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
		],
	);
});

test("reports a disable-command error as a warning when readback confirms Default", async () => {
	const calls = [];
	const disableError = Object.assign(new Error("response lost"), { code: 1 });
	const responses = [
		{ error: disableError, stderr: "command response lost" },
		{ stdout: "disabled\n" },
		{ stdout: "Default\n" },
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

	assert.deepEqual(await client.setAutoSwitchEnabledAndRefresh(false), {
		status: { available: true, enabled: false },
		currentProfile: "Default",
		warning: "command response lost",
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "auto-switch", "disable"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
		],
	);
});

test("retries transient readback after disabling without changing the profile", async () => {
	const calls = [];
	const statusError = Object.assign(new Error("status read failed"), {
		code: 1,
	});
	const responses = [
		{ stdout: "" },
		{ error: statusError, stderr: "temporary status failure" },
		{ stdout: "Default\n" },
		{ stdout: "disabled\n" },
		{ stdout: "Default\n" },
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

	assert.deepEqual(await client.setAutoSwitchEnabledAndRefresh(false), {
		status: { available: true, enabled: false },
		currentProfile: "Default",
		warning: null,
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "auto-switch", "disable"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
		],
	);
});

test("reports a non-Default profile after disable without restoring it", async () => {
	const calls = [];
	const responses = ["", "disabled\n", "Gaming\n", "disabled\n", "Gaming\n"];
	const executeFile = (command, args, _options, callback) => {
		calls.push({ command, args: [...args] });
		callback(null, responses.shift(), "");
	};
	const client = createLactClient(executeFile);

	await assert.rejects(
		client.setAutoSwitchEnabledAndRefresh(false),
		/Could not verify profile after disabling automatic switching: LACT reports Gaming; expected Default\./,
	);
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "auto-switch", "disable"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "get"]],
		],
	);
});

test("reports when a failed disable leaves automatic switching enabled", async () => {
	const disableError = Object.assign(new Error("disable rejected"), {
		code: 1,
	});
	const responses = [
		{ error: disableError, stderr: "disable rejected" },
		{ stdout: "enabled\n" },
		{ stdout: "Gaming\n" },
		{ stdout: "enabled\n" },
		{ stdout: "Gaming\n" },
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
		client.setAutoSwitchEnabledAndRefresh(false),
		(error) =>
			error.message.includes(
				"LACT reports automatic switching enabled; expected disabled.",
			) &&
			error.message.includes(
				"Could not verify profile after disabling automatic switching: LACT reports Gaming; expected Default.",
			) &&
			error.message.includes("Command error: disable rejected"),
	);
});

test("does not restore a manual profile after auto-switch moves to Default", async () => {
	const calls = [];
	const responses = [
		"", // Manually select the test profile.
		"Gaming\n",
		"disabled\n",
		"", // Enable auto-switching.
		"enabled\n",
		"Default\n", // No rules match, so LACT selects Default.
		"", // Disable auto-switching.
		"disabled\n",
		"Default\n",
	];
	const executeFile = (command, args, _options, callback) => {
		calls.push({ command, args: [...args] });
		callback(null, responses.shift(), "");
	};
	const client = createLactClient(executeFile);

	assert.deepEqual(await client.selectProfileAndRefresh("Gaming"), {
		currentProfile: "Gaming",
		autoSwitchStatus: { available: true, enabled: false },
		error: null,
		warning: null,
	});
	assert.deepEqual(await client.setAutoSwitchEnabledAndRefresh(true), {
		status: { available: true, enabled: true },
		currentProfile: "Default",
		warning: null,
	});
	assert.deepEqual(await client.setAutoSwitchEnabledAndRefresh(false), {
		status: { available: true, enabled: false },
		currentProfile: "Default",
		warning: null,
	});
	assert.deepEqual(
		calls.map(({ command, args }) => [command, args]),
		[
			["lact", ["cli", "profile", "set", "Gaming"]],
			["lact", ["cli", "profile", "get"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
			["lact", ["cli", "profile", "auto-switch", "enable"]],
			["lact", ["cli", "profile", "auto-switch", "get"]],
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

	assert.deepEqual(await client.setAutoSwitchEnabledAndRefresh(true), {
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
