import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getPreferenceValues } from "@vicinae/api";
import {
	type EnteSecret,
	expandConfiguredPath,
	parseSecrets,
} from "./ente-contract";

import { resolveEnteCliPath } from "./ente-cli-path";
import {
	detectCliGeneration,
	exportModernPlaintext,
	syncLegacyAuthExportDirectory,
} from "./ente-cli-compat";

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
	return resolveEnteCliPath(configured);
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

/** Export Auth codes using the matching legacy or modern Ente CLI interface. */
export async function exportEnteAuthSecrets(): Promise<{
	filePath: string;
	secrets: EnteSecret[];
}> {
	const generation = await detectCliGeneration(runEnte);
	const directory = exportDirectory();
	if (generation === "modern") return exportModernPlaintext(directory, runEnte);

	await mkdir(directory, { recursive: true, mode: 0o700 });
	await syncLegacyAuthExportDirectory(directory, runEnte);
	await runEnte(["export"], 60_000);
	const result = await readExportedSecrets();
	if (process.platform !== "win32") await chmod(result.filePath, 0o600);
	return result;
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
