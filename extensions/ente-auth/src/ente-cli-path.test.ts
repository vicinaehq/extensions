import * as assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEnteCliPath } from "./ente-cli-path";

void test("discovers Apple Silicon Homebrew Ente when a macOS GUI omits Homebrew from PATH", () => {
	const visited: string[] = [];
	const resolved = resolveEnteCliPath("ente", {
		platform: "darwin",
		home: "/Users/example",
		pathEnv: "/usr/bin:/bin",
		isExecutable: (candidate) => {
			visited.push(candidate);
			return candidate === "/opt/homebrew/bin/ente";
		},
	});
	assert.equal(resolved, "/opt/homebrew/bin/ente");
	assert.ok(visited.includes("/opt/homebrew/bin/ente"));
});

void test("prefers an executable already on PATH over a fallback location", () => {
	assert.equal(
		resolveEnteCliPath("ente", {
			platform: "darwin",
			home: "/Users/example",
			pathEnv: "/custom/bin:/bin",
			isExecutable: (candidate) => candidate === "/custom/bin/ente",
		}),
		"/custom/bin/ente",
	);
});

void test("respects explicitly configured paths, even when a fallback exists", () => {
	assert.equal(
		resolveEnteCliPath("/custom/ente", {
			platform: "darwin",
			isExecutable: () => false,
		}),
		"/custom/ente",
	);
	assert.equal(
		resolveEnteCliPath("~/.local/bin/ente", {
			platform: "linux",
			home: "/home/example",
			isExecutable: () => false,
		}),
		"/home/example/.local/bin/ente",
	);
});

void test("locates a user-managed Ente installation on Linux", () => {
	assert.equal(
		resolveEnteCliPath(undefined, {
			platform: "linux",
			home: "/home/example",
			pathEnv: "/usr/bin",
			isExecutable: (candidate) =>
				candidate === "/home/example/.local/opt/ente-cli/bin/ente",
		}),
		"/home/example/.local/opt/ente-cli/bin/ente",
	);
});

void test("resolves .exe executables from Windows PATH", () => {
	assert.equal(
		resolveEnteCliPath("ente", {
			platform: "win32",
			home: "C:\\Users\\example",
			pathEnv: "C:\\Tools;C:\\Windows\\System32",
			isExecutable: (candidate) => candidate === "C:\\Tools\\ente.exe",
		}),
		"C:\\Tools\\ente.exe",
	);
});

void test("retains the original executable-name fallback when Ente is not installed", () => {
	assert.equal(
		resolveEnteCliPath("ente", {
			platform: "darwin",
			pathEnv: "",
			isExecutable: () => false,
		}),
		"ente",
	);
});
