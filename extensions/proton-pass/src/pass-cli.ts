import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { getPreferenceValues, open } from "@vicinae/api";
import type { PasswordOptions, PasswordScore } from "./cli-contract";
import {
	extractTotpCode,
	parseScore,
	passwordArgs,
	record,
	scoreArgs,
	text,
	typedFields,
} from "./cli-contract";

export type { PasswordOptions, PasswordScore } from "./cli-contract";
export { extractTotpCode, penaltyLabel } from "./cli-contract";

const execFileAsync = promisify(execFile);

interface Preferences {
	cliPath?: string;
	keyProvider?: string;
	linuxKeyring?: string;
}

export type Vault = {
	shareId: string;
	name: string;
	itemCount?: number;
	role?: string;
};

/** Index a vault list by share id so an item can be matched to its vault. */
export function roleByShareId(
	vaults: Vault[],
): Map<string, string | undefined> {
	return new Map(vaults.map((vault) => [vault.shareId, vault.role]));
}

export type PassItem = {
	shareId: string;
	itemId: string;
	title: string;
	vaultName: string;
	type: string;
	username?: string;
	email?: string;
	urls?: string[];
	hasTotp: boolean;
};

export type PassItemDetail = PassItem & {
	password?: string;
	note?: string;
	customFields?: Array<{
		name: string;
		value: string;
		type: "text" | "hidden";
	}>;
	/** Type-specific fields (e.g. credit-card number, expiry), in display order. */
	fields?: Array<{
		title: string;
		value: string;
		hidden?: boolean;
		copy?: boolean;
	}>;
};

function cliPath(): string {
	const configured = getPreferenceValues<Preferences>().cliPath?.trim();
	return configured || "pass-cli";
}

function reason(action: string): Record<string, string> {
	const env: Record<string, string> = {
		...process.env,
		PROTON_PASS_AGENT_REASON: `Vicinae Proton Pass extension: ${action}`,
	};
	// Optional overrides for where pass-cli keeps its encryption key. The
	// "default" sentinel means "inherit whatever the environment already has",
	// so an unset preference never clobbers a working setup.
	const prefs = getPreferenceValues<Preferences>();
	if (prefs.keyProvider && prefs.keyProvider !== "default") {
		env.PROTON_PASS_KEY_PROVIDER = prefs.keyProvider;
	}
	if (prefs.linuxKeyring && prefs.linuxKeyring !== "default") {
		env.PROTON_PASS_LINUX_KEYRING = prefs.linuxKeyring;
	}
	return env;
}

// Recent successful auth checks are reused briefly so a burst of sequential
// CLI calls (vault fetch, then per-vault member/item lists) does not pay the
// ~0.5s `info` round-trip for each one. Concurrent callers share one in-flight
// check; the TTL bounds staleness if the session is logged out underneath us.
const AUTH_TTL_MS = 20_000;
let authCheck: Promise<void> | undefined;
let authVerifiedAt = 0;

async function verifyAuthentication(): Promise<void> {
	if (Date.now() - authVerifiedAt < AUTH_TTL_MS) return;
	if (authCheck) return authCheck;
	authCheck = (async () => {
		try {
			await execFileAsync(cliPath(), ["info"], {
				env: reason("verify authentication before a protected operation"),
				encoding: "utf8",
				timeout: 10_000,
				maxBuffer: 256 * 1024,
			});
			authVerifiedAt = Date.now();
		} catch (error) {
			throw cliFailure(error, "pass-cli authentication check failed");
		}
	})().finally(() => {
		authCheck = undefined;
	});
	return authCheck;
}

async function run(
	args: string[],
	action: string,
	timeout = 15_000,
): Promise<string> {
	try {
		if (!(args.length === 1 && args[0] === "info"))
			await verifyAuthentication();
		const result = await execFileAsync(cliPath(), args, {
			env: reason(action),
			encoding: "utf8",
			timeout,
			maxBuffer: 4 * 1024 * 1024,
		});
		return result.stdout.trim();
	} catch (error) {
		throw cliFailure(error, "pass-cli failed");
	}
}

/**
 * Turn a failed pass-cli invocation into a redacted Error: a missing binary
 * gets a pointed message, anything else surfaces its stderr (or message).
 */
function cliFailure(error: unknown, fallback: string): Error {
	const err = error as NodeJS.ErrnoException & {
		stderr?: string;
		stdout?: string;
	};
	if (err.code === "ENOENT") {
		return new Error(
			`pass-cli was not found at '${cliPath()}'. Set the pass-cli path in Vicinae preferences.`,
		);
	}
	const detail =
		typeof err.stderr === "string" && err.stderr.trim()
			? err.stderr.trim()
			: err.message;
	const combined = `${detail} ${typeof err.stdout === "string" ? err.stdout : ""}`;
	return new Error(cliMessage(combined, fallback));
}

/**
 * Shared human-readable message for a failed pass-cli call. pass-cli buries its
 * key-access failures behind "Error creating client features", so translate
 * that into an actionable hint; otherwise redact and surface the detail.
 */
function cliMessage(detail: string, fallback: string): string {
	if (/encryption key|creating client features|keyring/i.test(detail)) {
		return "pass-cli could not reach its encryption key. Check the Key provider / Linux keyring settings for this extension, or run 'pass-cli logout --force' and log in again.";
	}
	return redactDiagnostic(detail.trim() || fallback);
}

function redactDiagnostic(value: string): string {
	return value
		.replace(/https?:\/\/\S+/gi, "[URL redacted]")
		.replace(
			/\b(token|secret|password|passwd|api[-_]?key|authorization|pat)\b\s*[:=]\s*\S+/gi,
			"$1=[redacted]",
		)
		.slice(0, 500);
}

// Keep only http(s) URLs, and strip any embedded credentials. Query strings
// and fragments are preserved: login URLs legitimately depend on them (SSO
// state, deep links), and dropping them would open the wrong destination.
function safeUrl(value: string): string | undefined {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
		url.username = "";
		url.password = "";
		return url.toString();
	} catch {
		return undefined;
	}
}

/** Sanitise the URL list from a login block, dropping any unsafe entry. */
function sanitiseUrls(source: unknown): string[] | undefined {
	if (!Array.isArray(source)) return undefined;
	const urls = source
		.map((entry) =>
			record(entry) ? text(entry.url ?? entry.href) : text(entry),
		)
		.map((value) => (value ? safeUrl(value) : undefined))
		.filter((value): value is string => Boolean(value));
	return urls.length ? urls : undefined;
}

function loginData(
	raw: Record<string, unknown>,
): Record<string, unknown> | undefined {
	const candidates: unknown[] = [
		raw,
		raw.content,
		record(raw.content) ? raw.content.content : undefined,
	];
	for (const candidate of candidates) {
		if (record(candidate) && record(candidate.Login)) return candidate.Login;
	}
	return undefined;
}

function typedData(raw: Record<string, unknown>): {
	type: string;
	data?: Record<string, unknown>;
} {
	const outer = record(raw.content) ? raw.content : raw;
	const inner = record(outer.content) ? outer.content : outer;
	const types: Array<[string, string]> = [
		["Login", "login"],
		["Note", "note"],
		["CreditCard", "credit_card"],
		["credit_card", "credit_card"],
		["Identity", "identity"],
		["Alias", "alias"],
		["SshKey", "ssh_key"],
		["ssh_key", "ssh_key"],
		["Wifi", "wifi"],
		["Custom", "custom"],
	];
	for (const [key, type] of types) {
		if (record(inner[key])) return { type, data: inner[key] };
	}
	return { type: "note" };
}

function itemType(raw: Record<string, unknown>): string {
	const summaryType = text(
		raw.item_type ?? raw.itemType ?? raw.type,
	)?.toLowerCase();
	if (summaryType) {
		const normalized = summaryType.replace(/-/g, "_");
		return normalized === "creditcard" ? "credit_card" : normalized;
	}
	return typedData(raw).type;
}

function parseJson(output: string, action: string): unknown {
	try {
		return JSON.parse(output) as unknown;
	} catch {
		throw new Error(`pass-cli returned invalid JSON for ${action}.`);
	}
}

/** True when a thrown value is an Error whose message matches `pattern`. */
function isErrorMatching(error: unknown, pattern: RegExp): boolean {
	return error instanceof Error && pattern.test(error.message);
}

function arrayFrom(data: unknown, key: string): unknown[] {
	if (Array.isArray(data)) return data;
	if (record(data) && Array.isArray(data[key])) return data[key] as unknown[];
	throw new Error(`Unexpected ${key} output from pass-cli.`);
}

let cachedAccountEmail: string | null | undefined;

/** The signed-in account's email, used to identify its role in a vault. */
async function accountEmail(): Promise<string | undefined> {
	if (cachedAccountEmail !== undefined) return cachedAccountEmail ?? undefined;
	try {
		const data = parseJson(
			await run(["user", "info", "--output", "json"], "read account info"),
			"user info",
		);
		const raw = record(data)
			? record(data.user)
				? data.user
				: data
			: undefined;
		cachedAccountEmail = text(raw?.email)?.toLowerCase() ?? null;
	} catch {
		// Agent sessions cannot read user info; fall back to the member list.
		cachedAccountEmail = null;
	}
	return cachedAccountEmail ?? undefined;
}

/**
 * The signed-in account's role in a vault. NOTE: `share list`'s `share_role`
 * is unreliable (it reports Viewer even for owned vaults), so we resolve the
 * role from `vault member list`, matching the account by email.
 */
async function vaultMemberRole(
	shareId: string,
	email: string | undefined,
): Promise<string | undefined> {
	try {
		const data = parseJson(
			await run(
				[
					"vault",
					"member",
					"list",
					`--share-id=${shareId}`,
					"--output",
					"json",
				],
				"list vault members",
			),
			"vault member list",
		);
		const members = (
			Array.isArray(data)
				? data
				: record(data) && Array.isArray(data.members)
					? data.members
					: []
		).flatMap((member) => (record(member) ? [member] : []));
		if (email) {
			const mine = members.find(
				(member) => text(member.email)?.toLowerCase() === email,
			);
			if (mine) {
				if (mine.is_group_share === true) return "group";
				return text(mine.role ?? mine.member_role)?.toLowerCase();
			}
		}
		// A single non-group member is unambiguously the signed-in account.
		const nonGroup = members.filter((member) => member.is_group_share !== true);
		if (nonGroup.length === 1) return text(nonGroup[0].role)?.toLowerCase();
		return undefined;
	} catch {
		return undefined;
	}
}

async function vaultRoles(shareIds: string[]): Promise<Map<string, string>> {
	const email = await accountEmail();
	const roles = new Map<string, string>();
	let next = 0;
	async function worker(): Promise<void> {
		while (next < shareIds.length) {
			const shareId = shareIds[next++];
			const role = await vaultMemberRole(shareId, email);
			if (role) roles.set(shareId, role);
		}
	}
	// Bound concurrency so a large vault list does not spawn one pass-cli
	// process per vault all at once.
	await Promise.all(
		Array.from({ length: Math.min(6, shareIds.length) }, () => worker()),
	);
	return roles;
}

export async function listVaults(): Promise<Vault[]> {
	const data = parseJson(
		await run(["vault", "list", "--output", "json"], "list vaults"),
		"vault list",
	);
	const raws = arrayFrom(data, "vaults").flatMap((raw) =>
		record(raw) ? [raw] : [],
	);
	const shareIds = raws
		.map((raw) => text(raw.share_id ?? raw.shareId ?? raw.id))
		.filter((id): id is string => Boolean(id));
	const roles = await vaultRoles(shareIds);
	return raws.flatMap((raw) => {
		const shareId = text(raw.share_id ?? raw.shareId ?? raw.id);
		const name = text(raw.name);
		const itemCountRaw =
			raw.item_count ?? raw.itemCount ?? raw.items_count ?? raw.itemsCount;
		const itemCount =
			itemCountRaw === undefined ? undefined : Number(itemCountRaw);
		const role =
			(shareId ? roles.get(shareId) : undefined) ??
			text(raw.role)?.toLowerCase();
		return shareId && name
			? [
					{
						shareId,
						name,
						itemCount:
							itemCount !== undefined && Number.isFinite(itemCount)
								? itemCount
								: undefined,
						role,
					},
				]
			: [];
	});
}

async function countItems(vault: Vault): Promise<number | undefined> {
	// `vault list` carries no item count; list without secrets and count.
	try {
		return (await listItemsOutput(vault, false)).length;
	} catch {
		return undefined;
	}
}

/**
 * Vaults with a live item count. `vault list` has no count field, so this adds
 * one `item list` per vault, run through a bounded worker pool.
 */
export async function listVaultsWithItemCounts(): Promise<Vault[]> {
	const vaults = await listVaults();
	let next = 0;
	async function worker(): Promise<void> {
		while (next < vaults.length) {
			const vault = vaults[next++];
			const count = await countItems(vault);
			if (count !== undefined) vault.itemCount = count;
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(6, vaults.length) }, () => worker()),
	);
	return vaults;
}

function itemFrom(raw: unknown, vault: Vault): PassItem | undefined {
	if (!record(raw)) return undefined;
	const outer = record(raw.content) ? raw.content : raw;
	const login = loginData(raw);
	const type = itemType(raw);
	const itemId = text(raw.id ?? raw.item_id ?? raw.itemId);
	const title = text(outer.title ?? raw.title ?? raw.name);
	if (!itemId || !title) return undefined;
	const urls = sanitiseUrls(login?.urls);
	const totp = text(
		login?.totp_uri ??
			login?.totpUri ??
			outer.totp_uri ??
			outer.totpUri ??
			raw.totp_uri ??
			raw.totpUri,
	);
	return {
		shareId: vault.shareId,
		itemId,
		title,
		vaultName: vault.name,
		type,
		username: login ? text(login.username) : text(raw.username),
		email: login ? text(login.email) : text(raw.email),
		urls,
		hasTotp: Boolean(totp),
	};
}

async function listItemsOutput(
	vault: Vault,
	showSecrets: boolean,
): Promise<PassItem[]> {
	const args = [
		"item",
		"list",
		`--share-id=${vault.shareId}`,
		"--output",
		"json",
	];
	if (showSecrets) args.push("--show-secrets");
	const data = parseJson(
		await run(args, `list items in ${vault.name}`),
		"item list",
	);
	return arrayFrom(data, "items")
		.filter(
			(raw) => !(record(raw) && text(raw.state)?.toLowerCase() === "trashed"),
		)
		.map((raw) => itemFrom(raw, vault))
		.filter((item): item is PassItem => Boolean(item));
}

function showSecretsUnavailable(error: unknown): boolean {
	return isErrorMatching(
		error,
		/show.?secrets|agent session|unknown option|unrecognized option/i,
	);
}

export async function listItems(vault: Vault): Promise<PassItem[]> {
	try {
		return await listItemsOutput(vault, true);
	} catch (error) {
		if (!showSecretsUnavailable(error)) throw error;
		return enrichItems(await listItemsOutput(vault, false));
	}
}

async function readOptionalField(
	item: PassItem,
	field: string,
): Promise<string | undefined> {
	try {
		return text(
			await run(
				[
					"item",
					"view",
					`--share-id=${item.shareId}`,
					`--item-id=${item.itemId}`,
					"--field",
					field,
				],
				`read ${field} for ${item.title}`,
			),
		);
	} catch (error) {
		if (
			isErrorMatching(error, /field does not exist|not a .* field|no .* field/i)
		)
			return undefined;
		throw error;
	}
}

async function readTotpData(item: PassItem): Promise<unknown> {
	return parseJson(
		await run(
			[
				"item",
				"totp",
				`--share-id=${item.shareId}`,
				`--item-id=${item.itemId}`,
				"--output",
				"json",
			],
			`read TOTP for ${item.title}`,
		),
		"item TOTP",
	);
}

function containsTotpCode(data: unknown): boolean {
	if (!record(data)) return false;
	const values = record(data.totps) ? data.totps : data;
	return Object.entries(values).some(
		([key, value]) =>
			!/recovery|backup/i.test(key) &&
			typeof value === "string" &&
			/^\d{6,8}$/.test(value.trim()),
	);
}

async function itemHasTotp(item: PassItem): Promise<boolean> {
	try {
		return containsTotpCode(await readTotpData(item));
	} catch (error) {
		if (isErrorMatching(error, /no .*totp|totp.*not|field does not exist/i))
			return false;
		throw error;
	}
}

async function enrichItem(item: PassItem): Promise<PassItem> {
	if (item.type !== "login" && item.type !== "alias") return item;
	const [username, email, hasTotp] = await Promise.all([
		item.type === "login" ? readOptionalField(item, "username") : undefined,
		readOptionalField(item, "email"),
		item.type === "login" ? itemHasTotp(item) : false,
	]);
	return {
		...item,
		username,
		email,
		hasTotp,
	};
}

async function enrichItems(items: PassItem[]): Promise<PassItem[]> {
	const enriched = new Array<PassItem>(items.length);
	let next = 0;
	async function worker(): Promise<void> {
		while (next < items.length) {
			const index = next++;
			enriched[index] = await enrichItem(items[index]);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(6, items.length) }, () => worker()),
	);
	return enriched;
}

export async function listVaultsAndItems(): Promise<{
	vaults: Vault[];
	items: PassItem[];
	failedVaults: string[];
}> {
	const vaults = await listVaults();
	const lists = new Array<PassItem[]>(vaults.length);
	const failedVaults: string[] = [];
	let next = 0;
	async function worker(): Promise<void> {
		while (next < vaults.length) {
			const index = next++;
			try {
				lists[index] = await listItems(vaults[index]);
			} catch {
				failedVaults.push(vaults[index].name);
				lists[index] = [];
			}
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(8, vaults.length) }, () => worker()),
	);
	return {
		vaults,
		items: lists.flat().sort((a, b) => a.title.localeCompare(b.title)),
		failedVaults: failedVaults.sort((a, b) => a.localeCompare(b)),
	};
}

export async function checkAuth(): Promise<boolean> {
	try {
		await run(["info"], "check authentication");
		return true;
	} catch (error) {
		if (isErrorMatching(error, /authenticated|logged in|session/i))
			return false;
		throw error;
	}
}

export async function login(): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(cliPath(), ["login"], {
			env: reason("login to Proton Pass"),
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		let opened = false;
		let settled = false;
		const timer = setTimeout(() => {
			child.kill();
			finish(
				new Error(
					"Proton Pass login timed out. Complete browser authentication and try again.",
				),
			);
		}, 10 * 60_000);

		function finish(error?: Error): void {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error) reject(error);
			else resolve();
		}

		function scanForLoginUrl(): void {
			if (opened) return;
			for (const candidate of output.match(/https?:\/\/\S+/g) ?? []) {
				try {
					const url = new URL(candidate.replace(/[),.;]+$/, ""));
					if (
						url.protocol !== "https:" ||
						!new Set(["account.proton.me", "account.proton.black"]).has(
							url.host,
						)
					)
						continue;
					opened = true;
					void open(url.toString()).catch(() => {
						child.kill();
						finish(new Error("Could not open the Proton Pass login URL."));
					});
					return;
				} catch {
					// Continue scanning output until pass-cli prints a complete URL.
				}
			}
		}

		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString("utf8");
			scanForLoginUrl();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			output += chunk.toString("utf8");
			scanForLoginUrl();
		});
		child.on("error", (error) =>
			finish(
				error instanceof Error ? error : new Error("pass-cli login failed."),
			),
		);
		child.on("close", (code) => {
			if (code === 0) finish();
			else
				finish(
					new Error(
						cliMessage(
							output,
							`pass-cli login exited with code ${code ?? "unknown"}.`,
						),
					),
				);
		});
	});
}

function unwrap(data: unknown): unknown {
	if (!record(data)) return data;
	for (const key of ["item", "data", "result", "response", "payload"]) {
		if (record(data[key])) return data[key];
	}
	return data;
}

export async function viewItem(item: PassItem): Promise<PassItemDetail> {
	const data = parseJson(
		await run(
			[
				"item",
				"view",
				`--share-id=${item.shareId}`,
				`--item-id=${item.itemId}`,
				"--output",
				"json",
			],
			`read item ${item.title}`,
		),
		"item view",
	);
	const raw = unwrap(data);
	if (!record(raw)) return item;
	const outer = record(raw.content) ? raw.content : raw;
	const login = loginData(raw);
	const type = itemType(raw);
	const typed = typedData(raw).data;
	const urls = sanitiseUrls(login?.urls) ?? item.urls;
	const customFieldsRaw =
		outer.extra_fields ??
		outer.extraFields ??
		raw.extra_fields ??
		raw.extraFields;
	const customFields = Array.isArray(customFieldsRaw)
		? customFieldsRaw.flatMap((field) => {
				if (!record(field)) return [];
				const name = text(field.name ?? field.key);
				const value = text(field.value);
				if (!name || !value) return [];
				return [
					{
						name,
						value,
						type:
							text(field.type)?.toLowerCase() === "text"
								? ("text" as const)
								: ("hidden" as const),
					},
				];
			})
		: undefined;
	return {
		...item,
		type,
		username: login ? (text(login.username) ?? item.username) : item.username,
		email: login ? (text(login.email) ?? item.email) : item.email,
		urls,
		password: login
			? text(login.password)
			: text(typed?.password ?? raw.password),
		note: text(outer.note ?? raw.note),
		customFields: customFields?.length ? customFields : undefined,
		fields: typedFields(type, typed, login),
	};
}

export async function getTotp(item: PassItem): Promise<string> {
	const data = await readTotpData(item);
	const code = extractTotpCode(data);
	if (code) return code;
	throw new Error(`No TOTP code is available for ${item.title}.`);
}

export async function generatePassword(
	options: PasswordOptions,
): Promise<string> {
	return run(passwordArgs(options), "generate a password");
}

export async function scorePassword(
	password: string,
): Promise<PasswordScore | undefined> {
	if (!password) return undefined;
	const data = parseJson(
		await run(scoreArgs(password), "score a password"),
		"password score",
	);
	return parseScore(data);
}
