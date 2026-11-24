import * as assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { detectCliGeneration, exportModernPlaintext, syncLegacyAuthExportDirectory, type RunEnte } from "./ente-cli-compat";

const sha256Url =
	"otpauth://totp/myGov?secret=JBSWY3DPEHPK3PXP&issuer=myGov+%28ATO%29&algorithm=SHA256&digits=6&period=30";

void test("detects modern CLI from --version without probing legacy command", async () => {
	const calls: string[][] = [];
	const version = await detectCliGeneration(async (args) => {
		calls.push(args);
		return "ente 0.4.2";
	});
	assert.equal(version, "modern");
	assert.deepEqual(calls, [["--version"]]);
});

void test("falls back to old CLI version command", async () => {
	const calls: string[][] = [];
	const version = await detectCliGeneration(async (args) => {
		calls.push(args);
		if (args[0] === "--version") throw new Error("unknown flag");
		return "Ente CLI version: v0.3.0";
	});
	assert.equal(version, "legacy");
	assert.deepEqual(calls, [["--version"], ["version"]]);
});

void test("keeps the configured export directory with legacy CLI when it already matches", async () => {
	const calls: string[][] = [];
	await syncLegacyAuthExportDirectory("/home/example/ente", async (args) => {
		calls.push(args);
		return "Email: user@example.com\nApp: auth\nExportDir: /home/example/ente";
	});
	assert.deepEqual(calls, [["account", "list"]]);
});

void test("updates legacy Auth directory without touching another app", async () => {
	const calls: string[][] = [];
	await syncLegacyAuthExportDirectory("/home/example/new", async (args) => {
		calls.push(args);
		if (args[0] === "account" && args[1] === "list") {
			return "Email: photos@example.com\nApp: photos\nExportDir: /home/photos\n====================================\nEmail: auth@example.com\nApp: auth\nExportDir: /home/old";
		}
		return "";
	});
	assert.deepEqual(calls, [
		["account", "list"],
		["account", "update", "--app", "auth", "--email", "auth@example.com", "--dir", "/home/example/new"],
	]);
});

void test("rejects unrecognised CLI versions instead of guessing commands", async () => {
	await assert.rejects(
		() => detectCliGeneration(async () => "Ente CLI version unknown"),
		/Unable to determine the Ente CLI version/,
	);
});

void test("exports SHA-256 secrets using modern CLI and atomically replaces the old file", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "ente-export-test-"));
	try {
		const filePath = path.join(directory, "ente_auth.txt");
		await writeFile(filePath, "old data", "utf8");
		const runEnte: RunEnte = async (args, timeout) => {
			assert.deepEqual(args.slice(0, 3), ["auth", "export", "--plaintext"]);
			assert.equal(timeout, 60_000);
			assert.ok(args.includes("--no-input"));
			const output = args[args.indexOf("--output") + 1];
			assert.ok(output);
			await writeFile(output, sha256Url + "\n", "utf8");
			return JSON.stringify({ output, codes: 1, failures: { total: 0 } });
		};
		const result = await exportModernPlaintext(directory, runEnte);
		assert.equal(result.filePath, filePath);
		assert.equal(result.secrets.length, 1);
		assert.equal(result.secrets[0]?.algorithm, "SHA256");
		assert.equal(result.secrets[0]?.period, 30);
		assert.equal(await readFile(filePath, "utf8"), sha256Url + "\n");
		assert.deepEqual(await readdir(directory), ["ente_auth.txt"]);
		if (process.platform !== "win32") {
			assert.equal((await stat(filePath)).mode & 0o777, 0o600);
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

void test("preserves the previous export when modern CLI fails", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "ente-export-test-"));
	try {
		const filePath = path.join(directory, "ente_auth.txt");
		await writeFile(filePath, "previous export", "utf8");
		await assert.rejects(
			() => exportModernPlaintext(directory, async () => { throw new Error("offline"); }),
			/offline/,
		);
		assert.equal(await readFile(filePath, "utf8"), "previous export");
		assert.deepEqual(await readdir(directory), ["ente_auth.txt"]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

void test("does not replace the previous export with invalid data", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "ente-export-test-"));
	try {
		const filePath = path.join(directory, "ente_auth.txt");
		await writeFile(filePath, "previous export", "utf8");
		await assert.rejects(
			() => exportModernPlaintext(directory, async (args) => {
				const output = args[args.indexOf("--output") + 1];
				assert.ok(output);
				await writeFile(output, "not-an-otpauth-url\n", "utf8");
				return "";
			}),
			/no valid TOTP accounts/,
		);
		assert.equal(await readFile(filePath, "utf8"), "previous export");
		assert.deepEqual(await readdir(directory), ["ente_auth.txt"]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
