import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { getPreferenceValues, open } from "@vicinae/api";
import type { PasswordOptions, PasswordScore } from "./cli-contract";
import {
	extractTotpCode,
	parseScore,
	passwordArgs,
	scoreArgs,
	typedFields,
} from "./cli-contract";

export type { PasswordOptions, PasswordScore } from "./cli-contract";
export {
	extractTotpCode,
	parseScore,
	passwordArgs,
	penaltyLabel,
	scoreArgs,
} from "./cli-contract";

const execFileAsync = promisify(execFile);
let authCheck: Promise<void> | undefined;

interface Preferences {
	cliPath?: string;
}

export type Vault = {
	shareId: string;
	name: string;
	itemCount?: number;
	role?: string;
};

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
	}>;
};

function cliPath(): string {
	const configured = getPreferenceValues<Preferences>().cliPath?.trim();
	return configured || "pass-cli";
}

function reason(action: string): Record<string, string> {
	return {
		...process.env,
		PROTON_PASS_AGENT_REASON: `Vicinae Proton Pass extension: ${action}`,
	};
}

async function verifyAuthentication(): Promise<void> {
	if (authCheck) return authCheck;
	authCheck = (async () => {
		try {
			await execFileAsync(cliPath(), ["info"], {
				env: reason("verify authentication before a protected operation"),
				encoding: "utf8",
				timeout: 10_000,
				maxBuffer: 256 * 1024,
			});
		} catch (error) {
			const err = error as NodeJS.ErrnoException & { stderr?: string };
			if (err.code === "ENOENT") {
				throw new Error(
					`pass-cli was not found at '${cliPath()}'. Set the pass-cli path in Vicinae preferences.`,
				);
			}
			const detail =
				typeof err.stderr === "string" && err.stderr.trim()
					? err.stderr.trim()
					: err.message;
			throw new Error(
				redactDiagnostic(detail || "pass-cli authentication check failed"),
			);
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
		const err = error as NodeJS.ErrnoException & {
			stderr?: string;
			stdout?: string;
		};
		const detail =
			typeof err.stderr === "string" && err.stderr.trim()
				? err.stderr.trim()
				: err.message;
		if (err.code === "ENOENT") {
			throw new Error(
				`pass-cli was not found at '${cliPath()}'. Set the pass-cli path in Vicinae preferences.`,
			);
		}
		throw new Error(redactDiagnostic(detail || "pass-cli failed"));
	}
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function safeUrl(value: string): string | undefined {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		return url.toString();
	} catch {
		return undefined;
	}
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

function arrayFrom(data: unknown, key: string): unknown[] {
	if (Array.isArray(data)) return data;
	if (record(data) && Array.isArray(data[key])) return data[key] as unknown[];
	throw new Error(`Unexpected ${key} output from pass-cli.`);
}

async function vaultRoles(): Promise<Map<string, string>> {
	// `vault list` carries no role; `share list` reports the role per share.
	try {
		const data = parseJson(
			await run(
				["share", "list", "--only-vaults", "true", "--output", "json"],
				"list vault roles",
			),
			"share list",
		);
		const roles = new Map<string, string>();
		for (const raw of arrayFrom(data, "shares")) {
			if (!record(raw)) continue;
			const id = text(raw.id ?? raw.share_id ?? raw.shareId);
			const role = text(
				raw.share_role ?? raw.role ?? raw.shareRole,
			)?.toLowerCase();
			if (id && role) roles.set(id, role);
		}
		return roles;
	} catch {
		// Roles are a cosmetic nicety; never fail vault listing over them.
		return new Map();
	}
}

export async function listVaults(): Promise<Vault[]> {
	const [data, roles] = await Promise.all([
		run(["vault", "list", "--output", "json"], "list vaults").then((out) =>
			parseJson(out, "vault list"),
		),
		vaultRoles(),
	]);
	return arrayFrom(data, "vaults").flatMap((raw) => {
		if (!record(raw)) return [];
		const shareId = text(raw.share_id ?? raw.shareId ?? raw.id);
		const name = text(raw.name);
		const itemCountRaw =
			raw.item_count ?? raw.itemCount ?? raw.items_count ?? raw.itemsCount;
		const itemCount =
			itemCountRaw === undefined ? undefined : Number(itemCountRaw);
		const role =
			text(raw.role)?.toLowerCase() ??
			(shareId ? roles.get(shareId) : undefined);
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

function itemFrom(raw: unknown, vault: Vault): PassItem | undefined {
	if (!record(raw)) return undefined;
	const outer = record(raw.content) ? raw.content : raw;
	const login = loginData(raw);
	const type = itemType(raw);
	const itemId = text(raw.id ?? raw.item_id ?? raw.itemId);
	const title = text(outer.title ?? raw.title ?? raw.name);
	if (!itemId || !title) return undefined;
	const urls =
		login && Array.isArray(login.urls)
			? login.urls
					.map((entry) =>
						record(entry) ? text(entry.url ?? entry.href) : text(entry),
					)
					.map((value) => (value ? safeUrl(value) : undefined))
					.filter((v): v is string => Boolean(v))
			: undefined;
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
	return (
		error instanceof Error &&
		/show.?secrets|agent session|unknown option|unrecognized option/i.test(
			error.message,
		)
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
			error instanceof Error &&
			/field does not exist|not a .* field|no .* field/i.test(error.message)
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
		if (
			error instanceof Error &&
			/no .*totp|totp.*not|field does not exist/i.test(error.message)
		)
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

export async function listAllItems(): Promise<PassItem[]> {
	return (await listVaultsAndItems()).items;
}

export async function checkAuth(): Promise<boolean> {
	try {
		await run(["info"], "check authentication");
		return true;
	} catch (error) {
		if (
			error instanceof Error &&
			/authenticated|logged in|session/i.test(error.message)
		)
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
						redactDiagnostic(output.trim()) ||
							`pass-cli login exited with code ${code ?? "unknown"}.`,
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
	const urls =
		login && Array.isArray(login.urls)
			? login.urls
					.map((entry) =>
						record(entry) ? text(entry.url ?? entry.href) : text(entry),
					)
					.map((value) => (value ? safeUrl(value) : undefined))
					.filter((v): v is string => Boolean(v))
			: item.urls;
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
