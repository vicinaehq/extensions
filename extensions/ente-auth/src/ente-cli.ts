import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getPreferenceValues } from "@vicinae/api";
import {
	type EnteSecret,
	expandConfiguredPath,
	parseEnteAccounts,
	parseSecrets,
} from "./ente-contract";

const execFileAsync = promisify(execFile);
const EXPORT_FILE_NAME = "ente_auth.txt";

export type EntePreferences = {
	cliPath?: string;
	exportPath?: string;
};

function preferences(): EntePreferences {
	return getPreferenceValues<EntePreferences>();
}

function cliPath(): string {
	const configured = expandConfiguredPath(preferences().cliPath, os.homedir());
	return configured || "ente";
}

function exportDirectory(): string {
	const configured = expandConfiguredPath(
		preferences().exportPath,
		os.homedir(),
	);
	return configured || path.join(os.homedir(), "Documents", "ente");
}

export function getExportFilePath(): string {
	return path.join(exportDirectory(), EXPORT_FILE_NAME);
}

async function runEnte(args: string[], timeout = 20_000): Promise<string> {
	try {
		const result = await execFileAsync(cliPath(), args, {
			encoding: "utf8",
			maxBuffer: 2 * 1024 * 1024,
			timeout,
			windowsHide: true,
		});
		return result.stdout.trim();
	} catch (reason: unknown) {
		const error = reason as NodeJS.ErrnoException & { stderr?: string };
		if (error.code === "ENOENT") {
			throw new Error(
				`Ente CLI was not found at '${cliPath()}'. Set the Ente CLI path in Vicinae preferences.`,
			);
		}
		const detail =
			typeof error.stderr === "string" && error.stderr.trim()
				? error.stderr.trim()
				: error.message;
		throw new Error((detail || "The Ente CLI command failed.").slice(0, 500));
	}
}

export async function checkEnteCli(): Promise<void> {
	await runEnte(["version"], 10_000);
}

async function syncAuthExportDirectory(
	expectedDirectory: string,
): Promise<void> {
	const accountList = await runEnte(["account", "list"]);
	const authAccount = parseEnteAccounts(accountList).find(
		(account) => account.app === "auth",
	);
	if (!authAccount?.email) {
		throw new Error(
			"No Ente Auth account was found. Run `ente account add`, choose `auth`, and authenticate first.",
		);
	}
	if (
		authAccount.exportDir &&
		path.resolve(authAccount.exportDir) === path.resolve(expectedDirectory)
	)
		return;
	await runEnte([
		"account",
		"update",
		"--app",
		"auth",
		"--email",
		authAccount.email,
		"--dir",
		expectedDirectory,
	]);
}

/** Run `ente export` and verify that the expected export file was created. */
export async function exportEnteAuthSecrets(): Promise<{
	filePath: string;
	secrets: EnteSecret[];
}> {
	await checkEnteCli();
	const directory = exportDirectory();
	await mkdir(directory, { recursive: true });
	await syncAuthExportDirectory(directory);
	await runEnte(["export"], 60_000);
	return readExportedSecrets();
}

/** Read the existing export without invoking the CLI. */
export async function readExportedSecrets(): Promise<{
	filePath: string;
	secrets: EnteSecret[];
}> {
	const filePath = getExportFilePath();
	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch (reason: unknown) {
		const error = reason as NodeJS.ErrnoException;
		if (error.code === "ENOENT") {
			throw new Error(
				`No Ente Auth export found at '${filePath}'. Run Import Ente Auth Secrets first.`,
			);
		}
		throw reason;
	}
	const secrets = parseSecrets(content.split(/\r?\n/));
	if (secrets.length === 0) {
		throw new Error(
			`The Ente Auth export at '${filePath}' contains no valid TOTP accounts.`,
		);
	}
	return { filePath, secrets };
}

export async function deleteEnteAuthExport(): Promise<string> {
	const filePath = getExportFilePath();
	await rm(filePath, { force: true });
	return filePath;
}
