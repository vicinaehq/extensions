import { getPreferenceValues } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

interface Preferences {
	rbwPath: string;
}

const execFileAsync = promisify(execFile);

const LIST_FIELDS = "id,name,user,folder";

export type VaultEntry = {
	id: string;
	name: string;
	user: string | null;
	folder: string | null;
	uris: string[];
	type: string;
};

export type DetailedEntry = {
	name: string;
	user: string | null;
	password: string;
	fields: { name: string; value: string }[];
	notes: string | null;
	uris: string[];
};

type RawUri = string | { uri?: string | null };

type RawVaultItem = {
	id?: string;
	name?: string;
	user?: string | null;
	folder?: string | null;
	uris?: RawUri[];
	type?: string;
	notes?: string | null;
	data?: {
		username?: string | null;
		password?: string | null;
		uris?: RawUri[];
	};
	fields?: Array<{ name?: string; value?: string | null }>;
};

export class RbwError extends Error {
	constructor(
		message: string,
		public readonly stderr?: string,
	) {
		super(message);
		this.name = "RbwError";
	}
}

export class RbwNotInstalledError extends Error {
	constructor() {
		super(
			"rbw is not installed. Install it with `pacman -S rbw` (Arch), `brew install rbw` (macOS), or from https://github.com/doy/rbw. Also, try configuring the rbwPath setting in Vicinae settings.",
		);
		this.name = "RbwNotInstalledError";
	}
}

export async function runRbw(
	args: string[],
	options?: { timeout?: number },
): Promise<string> {
	const { rbwPath } = getPreferenceValues<Preferences>();
	try {
		const { stdout } = await execFileAsync(rbwPath.trim() ?? "rbw", args, {
			maxBuffer: 4 * 1024 * 1024,
			encoding: "utf-8",
			timeout: options?.timeout ?? 15_000,
		});
		return stdout;
	} catch (error) {
		const err = error as NodeJS.ErrnoException & { stderr?: string };
		if (err.code === "ENOENT") {
			throw new RbwNotInstalledError();
		}
		throw new RbwError(
			`rbw command failed: ${err.message}`,
			typeof err.stderr === "string" ? err.stderr : undefined,
		);
	}
}

function urisFrom(raw?: RawUri[]): string[] {
	if (!raw) {
		return [];
	}
	return raw
		.map((uri) => (typeof uri === "string" ? uri : (uri.uri ?? "")))
		.filter(Boolean);
}

function normalizeEntry(entry: RawVaultItem): VaultEntry {
	return {
		id: entry.id ?? "",
		name: entry.name ?? "",
		user: entry.user ?? null,
		folder: entry.folder ?? null,
		uris: urisFrom(entry.uris),
		type: entry.type ?? "",
	};
}

/** Parse `rbw list --fields id,name,user,folder` (tab-separated, rbw < 1.14). */
function parseListTsv(stdout: string): VaultEntry[] {
	return stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [id = "", name = "", user, folder] = line.split("\t");
			return {
				id,
				name,
				user: user || null,
				folder: folder || null,
				uris: [],
				type: "",
			};
		});
}

function matchesSearch(entry: VaultEntry, term: string): boolean {
	const needle = term.toLowerCase();
	return (
		entry.name.toLowerCase().includes(needle) ||
		(entry.user ?? "").toLowerCase().includes(needle) ||
		(entry.folder ?? "").toLowerCase().includes(needle) ||
		entry.uris.some((uri) => uri.toLowerCase().includes(needle))
	);
}

/** Check if the vault is currently unlocked. */
export async function isUnlocked(): Promise<boolean> {
	try {
		await runRbw(["unlocked"]);
		return true;
	} catch (error) {
		if (error instanceof RbwNotInstalledError) {
			throw error;
		}
		return false;
	}
}

/**
 * List all vault entries.
 * rbw 1.14+ supports `list --raw` JSON; older releases only have `--fields` TSV.
 */
export async function listEntries(): Promise<VaultEntry[]> {
	try {
		const stdout = await runRbw(["list", "--raw"]);
		return (JSON.parse(stdout) as RawVaultItem[]).map(normalizeEntry);
	} catch (error) {
		if (error instanceof RbwNotInstalledError) {
			throw error;
		}
		const stdout = await runRbw(["list", "--fields", LIST_FIELDS]);
		return parseListTsv(stdout);
	}
}

/**
 * Search vault entries by term.
 * rbw 1.14+ supports `search --raw`; older `search` prints `user@name` lines that
 * cannot be parsed reliably, so fall back to filtering the full list.
 */
export async function searchEntries(term: string): Promise<VaultEntry[]> {
	try {
		const stdout = await runRbw(["search", "--raw", term]);
		return (JSON.parse(stdout) as RawVaultItem[]).map(normalizeEntry);
	} catch (error) {
		if (error instanceof RbwNotInstalledError) {
			throw error;
		}
		const entries = await listEntries();
		return entries.filter((entry) => matchesSearch(entry, term));
	}
}

/** Get a specific field from an entry. */
export async function getField(
	field: string,
	name: string,
	user?: string,
): Promise<string> {
	const args = ["get", "--field", field, name];
	if (user) args.push(user);
	return (await runRbw(args)).trimEnd();
}

/**
 * Load one entry via `rbw get --raw` (available since rbw 1.6).
 * Avoids `get --list-fields`, which is not a real rbw flag.
 */
export async function getDetailedEntry(
	name: string,
	user?: string,
): Promise<DetailedEntry> {
	const args = ["get", "--raw", name];
	if (user) args.push(user);
	const raw = JSON.parse(await runRbw(args)) as RawVaultItem;
	const data = raw.data ?? {};
	return {
		name: raw.name || name,
		user: data.username ?? user ?? null,
		password: data.password ?? "",
		fields: (raw.fields ?? [])
			.map((field) => ({ name: field.name ?? "", value: field.value ?? "" }))
			.filter((field) => field.name),
		notes: raw.notes ?? null,
		uris: urisFrom(data.uris),
	};
}

/** Get the current TOTP code for an entry. */
export async function getCode(name: string, user?: string): Promise<string> {
	const args = ["code", name];
	if (user) args.push(user);
	return (await runRbw(args)).trimEnd();
}

/** Sync the vault with the Bitwarden server. */
export async function syncVault(): Promise<void> {
	await runRbw(["sync"], { timeout: 60_000 });
}
