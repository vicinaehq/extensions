import { chmod, mkdtemp, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
	type EnteSecret,
	parseEnteAccounts,
	parseSecrets,
} from "./ente-contract";

export type CliGeneration = "legacy" | "modern";
export type RunEnte = (args: string[], timeout?: number) => Promise<string>;

/** Determine the CLI generation from its actual version, not its executable name. */
export async function detectCliGeneration(
	runEnte: RunEnte,
): Promise<CliGeneration> {
	let lastError: unknown;
	for (const command of [["--version"], ["version"]]) {
		try {
			const output = await runEnte(command, 10_000);
			const match = output.match(/\b(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+][\w.-]+)?\b/i);
			if (match) {
				const major = Number(match[1]);
				const minor = Number(match[2]);
				return major > 0 || minor >= 4 ? "modern" : "legacy";
			}
		} catch (error: unknown) {
			lastError = error;
		}
	}
	if (lastError instanceof Error) throw lastError;
	throw new Error(
		"Unable to determine the Ente CLI version. Expected 0.3.x or 0.4.x or newer.",
	);
}

/** Keep the legacy 0.3.x export directory in sync before running `ente export`. */
export async function syncLegacyAuthExportDirectory(
	expectedDirectory: string,
	runEnte: RunEnte,
): Promise<void> {
	const accounts = parseEnteAccounts(await runEnte(["account", "list"]));
	const authAccount = accounts.find((account) => account.app === "auth");
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

/**
 * New CLI exports must never overwrite an existing file. Use a private staging
 * directory and replace the stable export only once it contains valid entries.
 * The UI can therefore keep reading ente_auth.txt across both CLI generations.
 */
export async function exportModernPlaintext(
	directory: string,
	runEnte: RunEnte,
): Promise<{ filePath: string; secrets: EnteSecret[] }> {
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const temporaryDirectory = await mkdtemp(path.join(directory, ".ente-auth-"));
	const temporaryFile = path.join(temporaryDirectory, "ente_auth.txt");
	const filePath = path.join(directory, "ente_auth.txt");
	try {
		await runEnte(
			[
				"auth",
				"export",
				"--plaintext",
				"--output",
				temporaryFile,
				"--no-input",
				"--json",
			],
			60_000,
		);
		const content = await readFile(temporaryFile, "utf8");
		const secrets = parseSecrets(content.split(/\r?\n/));
		if (secrets.length === 0) {
			throw new Error(
				"The Ente Auth export contains no valid TOTP accounts. Existing export was preserved.",
			);
		}
		if (process.platform !== "win32") await chmod(temporaryFile, 0o600);
		await rename(temporaryFile, filePath);
		return { filePath, secrets };
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}
