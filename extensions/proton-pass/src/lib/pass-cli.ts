import { getPreferenceValues } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	normalizeItem,
	normalizeItemDetail,
	normalizeVault,
} from "./normalize";
import {
	Item,
	ItemDetail,
	PassCliError,
	PassCliErrorType,
	PasswordOptions,
	Vault,
} from "./types";

const DEFAULT_CLI_COMMAND = "pass-cli";
const execFileAsync = promisify(execFile);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function trimOrUndefined(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function truncateMiddle(value: string, maxLen: number): string {
	if (value.length <= maxLen) return value;
	const head = Math.max(0, Math.floor((maxLen - 1) / 2));
	const tail = Math.max(0, maxLen - head - 1);
	return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

function getCliPath(): string {
	const configured = trimOrUndefined(
		getPreferenceValues<{ cliPath?: string }>().cliPath,
	);
	if (!configured || configured === DEFAULT_CLI_COMMAND)
		return DEFAULT_CLI_COMMAND;
	// Allow users to paste a quoted path (e.g. with spaces) into the preference.
	return configured.replace(/^["']|["']$/g, "").trim() || DEFAULT_CLI_COMMAND;
}

function getCliEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		...process.env,
	};

	// Explicit preferences override the environment so the keyring behaviour
	// does not depend on how the Vicinae process was launched.
	const { keyProvider, linuxKeyring } = getPreferenceValues<{
		keyProvider?: string;
		linuxKeyring?: string;
	}>();

	if (keyProvider && keyProvider !== "auto") {
		env.PROTON_PASS_KEY_PROVIDER = keyProvider;
	}
	if (linuxKeyring && linuxKeyring !== "auto") {
		env.PROTON_PASS_LINUX_KEYRING = linuxKeyring;
	}

	return env;
}

// pass-cli is an external process: it reports every failure as a non-zero exit
// code plus a human-readable message on stderr, so the message text is the only
// structured signal available. Match precise patterns per category instead of
// loose substrings to avoid false positives.
const ERROR_PATTERNS: ReadonlyArray<{
	type: PassCliErrorType;
	patterns: RegExp[];
}> = [
	{
		type: "keyring_error",
		patterns: [
			/cannot get the encryption key/i,
			/error creating client features/i,
			/no storage access/i,
			/secret service/i,
		],
	},
	{
		type: "not_authenticated",
		patterns: [
			/requires an authenticated client/i,
			/not authenticated/i,
			/login required/i,
			/please login/i,
			/not logged in/i,
			/session expired/i,
		],
	},
	{
		type: "network_error",
		patterns: [
			/\bnetwork\b/i,
			/\btimed? out\b/i,
			/\bconnection\b/i,
			/\bdns\b/i,
			/failed to connect/i,
		],
	},
];

function classifyCliError(text: string): PassCliErrorType {
	const normalized = text.toLowerCase();
	for (const { type, patterns } of ERROR_PATTERNS) {
		if (patterns.some((pattern) => pattern.test(normalized))) return type;
	}
	return "unknown";
}

function normalizeCliError(error: unknown, cliPath: string): PassCliError {
	const execErr = error as NodeJS.ErrnoException & {
		killed?: boolean;
		signal?: string;
		stderr?: string;
	};

	if (execErr?.killed && typeof execErr.signal === "string") {
		return new PassCliError("pass-cli timed out. Please try again.", "timeout");
	}

	const isEnoent = execErr?.code === "ENOENT" || execErr?.errno === -2;
	if (isEnoent) {
		return new PassCliError(
			`pass-cli not found at '${cliPath}'. Install it or set the correct path in extension preferences.`,
			"not_installed",
		);
	}

	const message = error instanceof Error ? error.message : "";
	const stderr = typeof execErr?.stderr === "string" ? execErr.stderr : "";
	const combined = [stderr, message]
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.join("\n");

	const type = classifyCliError(combined);

	if (type === "keyring_error") {
		return new PassCliError(
			"pass-cli could not access secure key storage. Check the Key provider and Linux keyring backend preferences, or see the troubleshooting guide.",
			"keyring_error",
		);
	}

	if (type === "not_authenticated") {
		return new PassCliError(
			"Not authenticated. Run pass-cli login to authenticate.",
			"not_authenticated",
		);
	}

	if (type === "network_error") {
		return new PassCliError(
			"Network error. Check your connection and try again.",
			"network_error",
		);
	}

	const safeDetails =
		combined.length > 0
			? truncateMiddle(combined, 600)
			: "An unknown error occurred while running pass-cli.";
	return new PassCliError(safeDetails, "unknown");
}

async function execCli(
	args: string[],
	timeout = 60_000,
): Promise<{ stdout: string; stderr: string }> {
	const cliPath = getCliPath();

	try {
		const { stdout, stderr } = await execFileAsync(cliPath, args, {
			env: getCliEnv(),
			timeout,
			maxBuffer: 20 * 1024 * 1024,
		});
		return { stdout: stdout ?? "", stderr: stderr ?? "" };
	} catch (error) {
		throw normalizeCliError(error, cliPath);
	}
}

async function runCli(args: string[]): Promise<string> {
	const { stdout } = await execCli(args);
	return stdout.trim();
}

function parseJson<T>(text: string, context: string): T {
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new PassCliError(
			`Unexpected ${context} output from pass-cli. Please update pass-cli and try again.`,
			"invalid_output",
		);
	}
}

export async function checkAuth(): Promise<boolean> {
	try {
		await runCli(["test"]);
		return true;
	} catch (error) {
		if (error instanceof PassCliError && error.type === "not_authenticated") {
			return false;
		}
		throw error;
	}
}

export async function loginWithBrowser(): Promise<void> {
	// The web login blocks until the browser flow completes, so give it a long timeout.
	await execCli(["login"], 10 * 60_000);
}

export async function listVaults(): Promise<Vault[]> {
	const output = await runCli(["vault", "list", "--output", "json"]);
	const data = parseJson<unknown>(output, "vault list");
	const vaults =
		isRecord(data) && Array.isArray(data.vaults) ? data.vaults : undefined;
	if (!vaults)
		throw new PassCliError(
			"Unexpected vault list output from pass-cli.",
			"invalid_output",
		);
	return vaults.map(normalizeVault);
}

async function listItemsFromVault(
	shareId: string,
	vaultName: string,
): Promise<Item[]> {
	const output = await runCli([
		"item",
		"list",
		"--share-id",
		shareId,
		"--output",
		"json",
	]);
	const data = parseJson<unknown>(output, "item list");
	const items =
		isRecord(data) && Array.isArray(data.items) ? data.items : undefined;
	if (!items)
		throw new PassCliError(
			"Unexpected item list output from pass-cli.",
			"invalid_output",
		);

	return items
		.filter(
			(item) => !(isRecord(item) && trimOrUndefined(item.state) === "Trashed"),
		)
		.map((item) => normalizeItem(item, vaultName));
}

export async function listItems(shareId?: string): Promise<Item[]> {
	if (shareId) {
		const vaults = await listVaults();
		const vault = vaults.find((v) => v.shareId === shareId);
		return listItemsFromVault(shareId, vault?.name ?? "Unknown Vault");
	}

	const vaults = await listVaults();
	const allItems: Item[] = [];
	for (const vault of vaults) {
		try {
			allItems.push(...(await listItemsFromVault(vault.shareId, vault.name)));
		} catch (error) {
			console.error(`Failed to list items from vault ${vault.name}:`, error);
		}
	}
	return allItems;
}

export async function getItem(item: Item): Promise<ItemDetail> {
	const output = await runCli([
		"item",
		"view",
		"--share-id",
		item.shareId,
		"--item-id",
		item.itemId,
		"--output",
		"json",
	]);
	return normalizeItemDetail(
		parseJson<unknown>(output, "item view"),
		item.vaultName,
	);
}

export async function getTotp(
	shareId: string,
	itemId: string,
): Promise<string> {
	const output = await runCli([
		"item",
		"totp",
		"--share-id",
		shareId,
		"--item-id",
		itemId,
		"--output",
		"json",
	]);
	const data = parseJson<Record<string, unknown>>(output, "item totp");

	const preferred =
		typeof data.totp === "string" && data.totp.trim()
			? data.totp.trim()
			: undefined;
	if (preferred) return preferred;

	const first = Object.values(data).find(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0,
	);
	if (!first)
		throw new PassCliError(
			"No TOTP fields found for this item.",
			"invalid_output",
		);
	return first.trim();
}

function parseGeneratedPassword(output: string): string {
	const data = parseJson<unknown>(output, "password generate");
	if (isRecord(data)) {
		const password = trimOrUndefined(data.password);
		if (password) return password;
	}
	return output;
}

export async function generatePassword(
	options: PasswordOptions,
): Promise<string> {
	if (options.type === "random") {
		const args = ["password", "generate", "random", "--output", "json"];
		if (options.length !== undefined)
			args.push("--length", String(options.length));
		if (options.includeNumbers !== undefined)
			args.push("--numbers", options.includeNumbers ? "true" : "false");
		if (options.includeUppercase !== undefined)
			args.push("--uppercase", options.includeUppercase ? "true" : "false");
		if (options.includeSymbols !== undefined)
			args.push("--symbols", options.includeSymbols ? "true" : "false");
		return parseGeneratedPassword(await runCli(args));
	}

	const args = ["password", "generate", "passphrase", "--output", "json"];
	if (options.words !== undefined) args.push("--count", String(options.words));
	if (options.separator !== undefined)
		args.push("--separator", options.separator);
	if (options.capitalize !== undefined)
		args.push("--capitalise", options.capitalize ? "true" : "false");
	if (options.includeNumbers !== undefined)
		args.push("--numbers", options.includeNumbers ? "true" : "false");
	return parseGeneratedPassword(await runCli(args));
}

/**
 * Map items to results with a bounded number of concurrent CLI invocations.
 * Used when probing every item would otherwise spawn a process per item.
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;

	async function worker(): Promise<void> {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index], index);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => worker()),
	);
	return results;
}
