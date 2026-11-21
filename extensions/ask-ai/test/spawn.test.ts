import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findBin, runCli } from "../src/providers/spawn.ts";
import { ProviderError } from "../src/providers/types.ts";

const dir = mkdtempSync(join(tmpdir(), "ask-ai-test-"));

/** A fake CLI that echoes stdin as lines, then idles until killed. */
const fake = join(dir, "fake-cli");
writeFileSync(
	fake,
	`#!/usr/bin/env node
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
	console.log(JSON.stringify({ input, args: process.argv.slice(2) }));
	if (process.argv.includes("--hang")) setInterval(() => {}, 1000);
	else process.exit(process.argv.includes("--fail") ? 3 : 0);
});
`,
);
chmodSync(fake, 0o755);

const base = { name: "fake-cli", label: "Fake", loginHint: "Sign in.", cwd: dir, extraPath: dir };

test("findBin searches the extra PATH first", () => {
	assert.equal(findBin("fake-cli", dir), fake);
	assert.equal(findBin("definitely-not-installed-cli", dir), undefined);
});

test("missing CLI explains how to fix it", () => {
	assert.throws(
		() => runCli({ ...base, name: "definitely-not-installed-cli", args: [], signal: new AbortController().signal, onLine() {} }),
		(err: unknown) => err instanceof ProviderError && /Extra PATH/.test(err.message),
	);
});

test("prompt goes through stdin, so flag-like text stays text", async () => {
	const lines: string[] = [];
	const run = runCli({ ...base, args: ["-p"], input: "-v vs --verbose?", signal: new AbortController().signal, onLine: (l) => lines.push(l) });
	await run.done;
	assert.deepEqual(JSON.parse(lines[0]), { input: "-v vs --verbose?", args: ["-p"] });
});

test("non-zero exit becomes a readable error with the login hint", async () => {
	const run = runCli({ ...base, args: ["--fail"], input: "", signal: new AbortController().signal, onLine() {} });
	await assert.rejects(run.done, (err: unknown) => err instanceof ProviderError && /code 3/.test(err.message) && /Sign in\./.test(err.message));
});

test("an already-aborted signal never starts the CLI", () => {
	const controller = new AbortController();
	controller.abort();
	assert.throws(() => runCli({ ...base, args: [], input: "x", signal: controller.signal, onLine() {} }), { name: "AbortError" });
});

test("abort kills the child", async () => {
	const controller = new AbortController();
	const run = runCli({ ...base, args: ["--hang"], input: "x", signal: controller.signal, onLine: () => controller.abort() });
	await assert.rejects(run.done, { name: "AbortError" });
	assert.notEqual(run.child.signalCode ?? run.child.exitCode, null);
	assert.throws(() => process.kill(run.child.pid!, 0));
});
