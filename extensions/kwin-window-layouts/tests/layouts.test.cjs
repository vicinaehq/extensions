const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { root, loadSource } = require("./helpers.cjs");

const { layouts } = loadSource(join(root, "src/layouts.ts"));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const template = readFileSync(join(root, "assets/apply-layout.js"), "utf8");

function runLayout(id, area, overrides = {}) {
	const window = {
		internalId: "target",
		frameGeometry: { x: 80, y: 100, width: 500, height: 400 },
		fullScreen: true,
		tile: {},
		setMaximize: (...args) => {
			window.maximized = args;
		},
	};
	const other = {
		internalId: "other",
		frameGeometry: { x: 0, y: 0, width: 100, height: 100 },
	};
	const workspace = {
		stackingOrder: [other, window],
		clientArea: (kind, target) => {
			assert.equal(kind, 7);
			assert.equal(target, window);
			return area;
		},
		raiseWindow: (target) => {
			workspace.raised = target;
		},
		...overrides,
	};
	vm.runInNewContext(
		template
			.replace("__TARGET_ID__", '"target"')
			.replace("__LAYOUT__", JSON.stringify(layouts[id])),
		{ workspace, KWin: { MaximizeArea: 7 } },
	);
	assert.deepEqual(other.frameGeometry, {
		x: 0,
		y: 0,
		width: 100,
		height: 100,
	});
	assert.equal(workspace.activeWindow, window);
	assert.equal(workspace.raised, window);
	assert.equal(window.fullScreen, false);
	assert.equal(window.tile, null);
	assert.deepEqual(window.maximized, [false, false]);
	return JSON.parse(JSON.stringify(window.frameGeometry));
}

test("every published command has an entry point, icon and matching layout", () => {
	assert.equal(
		new Set(manifest.commands.map((c) => c.name)).size,
		manifest.commands.length,
	);
	assert.deepEqual(
		manifest.commands.map((c) => c.name).sort(),
		Object.keys(layouts).sort(),
	);
	for (const command of manifest.commands) {
		assert.ok(existsSync(join(root, "assets", command.icon)), command.name);
		const entry = loadSource(join(root, "src", `${command.name}.ts`), {
			"./apply-layout": { commandFor: (id) => id },
		});
		assert.equal(entry.default, command.name);
	}
});

test("all layouts stay in the usable area across monitor origins and odd dimensions", () => {
	for (const area of [
		{ x: 0, y: 36, width: 1920, height: 1044 },
		{ x: -1920, y: -400, width: 1919, height: 1079 },
		{ x: 2560, y: 48, width: 2478, height: 1346 },
	]) {
		for (const id of Object.keys(layouts)) {
			const g = runLayout(id, area);
			assert.ok(g.width > 0 && g.height > 0, id);
			assert.ok(g.x >= area.x && g.y >= area.y, id);
			assert.ok(g.x + g.width <= area.x + area.width, id);
			assert.ok(g.y + g.height <= area.y + area.height, id);
		}
	}
});

test("adjacent thirds share exact edges on odd-width displays", () => {
	const area = { x: -1919, y: 32, width: 1919, height: 1047 };
	const first = runLayout("first-third", area);
	const middle = runLayout("center-third", area);
	const last = runLayout("last-third", area);
	assert.equal(first.x + first.width, middle.x);
	assert.equal(middle.x + middle.width, last.x);
	assert.equal(last.x + last.width, 0);
});

test("representative layouts have the documented size and placement", () => {
	const area = { x: -1200, y: 60, width: 1200, height: 960 };
	for (const [id, expected] of [
		["left-half", [-1200, 60, 600, 960]],
		["right-half", [-600, 60, 600, 960]],
		["top-left-quarter", [-1200, 60, 600, 480]],
		["top-right-quarter", [-600, 60, 600, 480]],
		["bottom-left-quarter", [-1200, 540, 600, 480]],
		["bottom-right-quarter", [-600, 540, 600, 480]],
		["center-third", [-800, 60, 400, 960]],
		["middle-half", [-1200, 300, 1200, 480]],
		["bottom-first-fourth", [-1200, 780, 1200, 240]],
		["middle-center-sixth", [-800, 300, 400, 480]],
		["middle-center-two-thirds", [-1000, 220, 800, 640]],
		["center-two-thirds", [-1000, 60, 800, 960]],
	]) {
		const g = runLayout(id, area);
		assert.deepEqual([g.x, g.y, g.width, g.height], expected, id);
	}
});

test("a window closed before execution fails instead of silently succeeding", () => {
	assert.throws(
		() => runLayout("left-half", {}, { stackingOrder: [] }),
		/no longer exists/,
	);
});
