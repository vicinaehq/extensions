import * as OTPAuth from "otpauth";

export type EnteSecret = {
	username: string;
	issuer: string;
	algorithm: string;
	digits: number;
	period: number;
	tags: string[];
	notes: string;
	secret: string;
};

export type TotpSnapshot = EnteSecret & {
	serviceName: string;
	current: string;
	next: string;
	remaining: number;
};

export type EnteAccount = {
	email?: string;
	app?: string;
	exportDir?: string;
};

function sanitiseOtpUrl(value: string): string {
	return value
		.replace(/&amp%3B/g, "&")
		.replace(/%25([0-9A-Fa-f]{2})/g, "%$1")
		.replace(/([?&]issuer)(?=&|$)/g, "$1=")
		.replace(/([?&])period=null(?=&|$)/g, "$1period=30")
		.replace(/([?&])(algorithm|digits)=null(?=&|$)/g, "$1")
		.replace(/\?&/g, "?")
		.replace(/&&+/g, "&")
		.replace(/[?&]$/, "")
		.replace(
			/([?&]secret=)([^&]+)/g,
			(_, prefix: string, secret: string) =>
				prefix + secret.replace(/[\s\-+]/g, ""),
		);
}

function parseCodeDisplay(url: URL): {
	tags: string[];
	notes: string;
	trashed: boolean;
} {
	const raw = url.searchParams.get("codeDisplay");
	if (!raw) return { tags: [], notes: "", trashed: false };
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null) {
			return { tags: [], notes: "", trashed: false };
		}
		const display = value as {
			tags?: unknown;
			note?: unknown;
			trashed?: unknown;
		};
		return {
			tags: Array.isArray(display.tags)
				? display.tags
						.filter((tag): tag is string => typeof tag === "string")
						.map((tag) => tag.trim())
						.filter(Boolean)
				: [],
			notes: typeof display.note === "string" ? display.note : "",
			trashed: display.trashed === true,
		};
	} catch {
		return { tags: [], notes: "", trashed: false };
	}
}

/** Parse one Ente otpauth export line without exposing parsing errors to callers. */
export function parseSecretUrl(value: string): EnteSecret | null {
	const sanitised = sanitiseOtpUrl(value.trim());
	if (!sanitised) return null;
	const url = new URL(sanitised);
	if (url.protocol !== "otpauth:") return null;
	const display = parseCodeDisplay(url);
	if (display.trashed) return null;

	const parsed = OTPAuth.URI.parse(sanitised);
	if (!(parsed instanceof OTPAuth.TOTP)) return null;
	const totp = parsed;
	const issuer = (totp.issuer || "").replace(/\+/g, " ").trim();
	const username = (totp.label || "").replace(/\+/g, " ").trim();
	const period = Number(url.searchParams.get("period")) || totp.period || 30;

	return {
		username,
		issuer,
		algorithm: totp.algorithm,
		digits: totp.digits,
		period,
		tags: display.tags,
		notes: display.notes,
		secret: totp.secret.base32,
	};
}

/** Parse an Ente export file, skipping blank, malformed and trashed entries. */
export function parseSecrets(lines: string[]): EnteSecret[] {
	const secrets: EnteSecret[] = [];
	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			const secret = parseSecretUrl(line);
			if (secret) secrets.push(secret);
		} catch {
			// One malformed export line must not hide every valid account.
		}
	}
	return secrets;
}

/** Generate the current and next code for a secret at a deterministic timestamp. */
export function snapshotSecret(
	secret: EnteSecret,
	timestamp = Date.now(),
): TotpSnapshot {
	const totp = new OTPAuth.TOTP({
		algorithm: secret.algorithm,
		digits: secret.digits,
		period: secret.period,
		secret: secret.secret,
	});
	const current = totp.generate({ timestamp });
	const next = totp.generate({ timestamp: timestamp + secret.period * 1000 });
	const remaining =
		secret.period - (Math.floor(timestamp / 1000) % secret.period);
	return {
		...secret,
		serviceName: secret.issuer || secret.username || "Ente Auth",
		current,
		next,
		remaining,
	};
}

/** Parse the human-readable output of `ente account list`. */
export function parseEnteAccounts(accountList: string): EnteAccount[] {
	const accounts: EnteAccount[] = [];
	let current: EnteAccount = {};
	for (const line of accountList.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("Configured accounts:")) continue;
		if (/^=+$/.test(trimmed)) {
			if (current.app || current.exportDir || current.email)
				accounts.push(current);
			current = {};
			continue;
		}
		const match = trimmed.match(/^([A-Za-z]+):\s*(.*)$/);
		if (!match) continue;
		const key = match[1] ?? "";
		const value = match[2] ?? "";
		if (key === "Email") current.email = value.trim();
		if (key === "App") current.app = value.trim().toLowerCase();
		if (key === "ExportDir") current.exportDir = value.trim();
	}
	if (current.app || current.exportDir || current.email) accounts.push(current);
	return accounts;
}

export function expandConfiguredPath(
	value: string | undefined,
	home: string,
): string {
	const trimmed = (value ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
	return trimmed.startsWith("~/") ? `${home}${trimmed.slice(1)}` : trimmed;
}

export function noteUrl(notes: string): string | undefined {
	try {
		const url = new URL(notes);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.toString()
			: undefined;
	} catch {
		return undefined;
	}
}
