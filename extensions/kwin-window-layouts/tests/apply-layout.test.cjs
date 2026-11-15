const assert = require("node:assert/strict");
const { join } = require("node:path");
const test = require("node:test");
const { root, loadSource } = require("./helpers.cjs");

const id = "{12345678-1234-1234-1234-123456789abc}";
const missing = (path) =>
	Object.assign(new Error(`spawn ${path} ENOENT`), { code: "ENOENT", path });

function harness(options = {}) {
	const state = {
		calls: [],
		hud: [],
		removed: [],
		writes: [],
		activeCalls: 0,
		closed: false,
	};
	const api = {
		environment: { assetsPath: join(root, "assets") },
		closeMainWindow: async () => {
			state.closed = true;
		},
		showHUD: async (message) => state.hud.push(message),
		WindowManagement: {
			getActiveWindow: async () => {
				assert.equal(state.closed, true);
				state.activeCalls++;
				if (options.active) return options.active(state.activeCalls);
				return { id };
			},
		},
	};
	const controller = loadSource(
		join(root, "src/apply-layout.ts"),
		{
			"@vicinae/api": api,
			"node:child_process": {
				execFile(command, args, processOptions, callback) {
					state.calls.push({ command, args });
					assert.equal(processOptions.timeout, 4000);
					try {
						const custom = options.run?.(command, args);
						const output =
							custom ??
							(command === "kdotool"
								? `${id}\n`
								: args.some((arg) => arg.endsWith(".loadScript"))
									? "(12,)"
									: args.some((arg) => arg.endsWith(".isScriptLoaded"))
										? "(true,)"
										: "()");
						callback(null, output, "");
					} catch (error) {
						callback(error, "", "");
					}
				},
			},
			"node:fs/promises": {
				mkdtemp: async () => "/tmp/layout-test",
				readFile: async () => {
					if (options.readError) throw options.readError;
					return "const id = __TARGET_ID__; const layout = __LAYOUT__;";
				},
				writeFile: async (...args) => state.writes.push(args),
				rm: async (...args) => state.removed.push(args),
			},
		},
		{
			setTimeout: (callback) => queueMicrotask(callback),
			console: { error() {} },
		},
	);
	return { state, apply: () => controller.applyLayout("left-half") };
}

test("normal API path loads, checks and unloads a private temporary script", async () => {
	const { state, apply } = harness();
	await apply();
	assert.deepEqual(state.hud, []);
	assert.equal(state.calls.filter((c) => c.command === "kdotool").length, 0);
	assert.deepEqual(
		state.calls.map((c) =>
			c.args[c.args.indexOf("--method") + 1].split(".").at(-1),
		),
		["loadScript", "run", "isScriptLoaded", "unloadScript"],
	);
	assert.equal(state.writes[0][2].mode, 0o600);
	assert.ok(state.writes[0][1].includes(JSON.stringify(id)));
	assert.equal(state.removed.length, 1);
});

test("brief tracker failure recovers without requiring kdotool", async () => {
	const { state, apply } = harness({
		active: (attempt) => {
			if (attempt < 3) throw new Error("Tracker unavailable");
			return { id };
		},
	});
	await apply();
	assert.equal(state.activeCalls, 3);
	assert.deepEqual(state.hud, []);
	assert.ok(state.calls.every((c) => c.command === "gdbus"));
});

test("invalid API IDs use a single KWin fallback after retrying the tracker", async () => {
	const { state, apply } = harness({ active: () => ({ id: "not-a-kwin-id" }) });
	await apply();
	assert.equal(state.activeCalls, 12);
	assert.equal(state.calls.filter((c) => c.command === "kdotool").length, 1);
	assert.deepEqual(state.hud, []);
});

for (const [label, error, message] of [
	["missing fallback", missing("kdotool"), /Install kdotool/],
	[
		"fallback timeout",
		Object.assign(new Error("fallback timed out"), { killed: true }),
		/No focused window/,
	],
	[
		"unsupported desktop",
		new Error("org.freedesktop.DBus.Error.ServiceUnknown: org.kde.KWin"),
		/KDE Plasma with KWin is required/,
	],
]) {
	test(`${label} reports a useful error without repeating the process`, async () => {
		const { state, apply } = harness({
			active: () => {
				throw new Error("Tracker unavailable");
			},
			run: () => {
				throw error;
			},
		});
		await apply();
		assert.equal(state.calls.length, 1);
		assert.match(state.hud[0], message);
		assert.equal(state.writes.length, 0);
	});
}

test("invalid fallback output never loads a script", async () => {
	const { state, apply } = harness({
		active: () => ({ id: "" }),
		run: () => "bad-id",
	});
	await apply();
	assert.equal(state.calls.length, 1);
	assert.match(state.hud[0], /No focused window/);
});

test("missing gdbus is identified and temporary files are removed", async () => {
	const { state, apply } = harness({
		run: () => {
			throw missing("gdbus");
		},
	});
	await apply();
	assert.match(state.hud[0], /gdbus is required/);
	assert.equal(state.removed.length, 1);
});

test("missing assets are not misreported as missing gdbus", async () => {
	const { state, apply } = harness({
		readError: missing("/extension/assets/apply-layout.js"),
	});
	await apply();
	assert.match(state.hud[0], /assets\/apply-layout.js/);
	assert.doesNotMatch(state.hud[0], /gdbus is required/);
	assert.equal(state.removed.length, 1);
});

for (const [label, run] of [
	[
		"rejected load",
		(_command, args) =>
			args.some((x) => x.endsWith(".loadScript")) ? "(-1,)" : undefined,
	],
	[
		"D-Bus run failure",
		(_command, args) => {
			if (args.some((x) => x.endsWith(".run")))
				throw new Error("Script run failed");
		},
	],
	[
		"JavaScript evaluation failure",
		(_command, args) =>
			args.some((x) => x.endsWith(".isScriptLoaded")) ? "(false,)" : undefined,
	],
]) {
	test(`${label} is reported and cleans up`, async () => {
		const { state, apply } = harness({ run });
		await apply();
		assert.equal(state.hud.length, 1);
		assert.equal(state.removed.length, 1);
		const unloaded = state.calls.some((c) =>
			c.args.some((x) => x.endsWith(".unloadScript")),
		);
		assert.equal(unloaded, label !== "rejected load");
	});
}

test("an unload failure still removes temporary files", async () => {
	const { state, apply } = harness({
		run: (_command, args) => {
			if (args.some((x) => x.endsWith(".unloadScript")))
				throw new Error("Unload failed");
		},
	});
	await apply();
	assert.equal(state.removed.length, 1);
});
