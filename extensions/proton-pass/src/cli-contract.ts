export type PasswordOptions = {
	type: "random" | "passphrase";
	length?: number;
	words?: number;
	includeNumbers?: boolean;
	includeUppercase?: boolean;
	includeSymbols?: boolean;
	separator?: string;
	capitalize?: boolean;
};

export function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Human-readable message for any thrown/rejected value. */
export function errorMessage(value: unknown): string {
	return value instanceof Error ? value.message : String(value);
}

function totpCode(value: unknown): string | undefined {
	const candidate = text(value);
	return candidate && /^\d{6,8}$/.test(candidate) ? candidate : undefined;
}

export function extractTotpCode(data: unknown): string | undefined {
	if (!record(data)) return undefined;
	const values = record(data.totps) ? data.totps : data;
	const preferredKeys = ["totp", "code", "primary"];
	for (const key of preferredKeys) {
		const code = totpCode(values[key]);
		if (code) return code;
	}
	const fallbackCodes: string[] = [];
	for (const [key, value] of Object.entries(values).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		if (/recovery|backup/i.test(key)) continue;
		const code = totpCode(value);
		if (code) fallbackCodes.push(code);
	}
	return fallbackCodes.length === 1 ? fallbackCodes[0] : undefined;
}

export type PasswordScore = {
	numericScore: number;
	label: "Strong" | "Good" | "Weak" | "Vulnerable" | "Unknown";
	penalties: string[];
};

const SCORE_LABELS = new Set(["Strong", "Good", "Weak", "Vulnerable"]);

// Human-readable text for the penalty keys pass-cli actually emits.
const PENALTY_LABELS: Record<string, string> = {
	ContainsCommonPassword: "Contains a common password",
	// pass-cli flags an adjacent repeated character (e.g. "aa", "55"), not a
	// run of distinct consecutive characters — so "repeated", not "consecutive".
	Consecutive: "Contains repeated characters",
	Progressive: "Contains a progressive or sequential pattern",
	Short: "Too short",
	TooShort: "Too short",
	NoUppercase: "No uppercase letters",
	NoLowercase: "No lowercase letters",
	NoNumbers: "No numbers",
	NoSymbols: "No symbols",
	Repetitive: "Contains repeated characters",
	Sequential: "Contains a sequential pattern",
};

export function penaltyLabel(penalty: string): string {
	return PENALTY_LABELS[penalty] ?? penalty.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function scoreArgs(password: string): string[] {
	return ["password", "score", password, "--output", "json"];
}

export function parseScore(data: unknown): PasswordScore | undefined {
	if (!record(data)) return undefined;
	const numericRaw = data.numeric_score ?? data.numericScore;
	const numericScore =
		typeof numericRaw === "number" && Number.isFinite(numericRaw)
			? numericRaw
			: 0;
	const rawLabel = text(data.password_score ?? data.passwordScore);
	const label =
		rawLabel && SCORE_LABELS.has(rawLabel)
			? (rawLabel as PasswordScore["label"])
			: "Unknown";
	const penaltiesRaw = data.penalties;
	const penalties = Array.isArray(penaltiesRaw)
		? penaltiesRaw.filter((p): p is string => typeof p === "string")
		: [];
	return { numericScore, label, penalties };
}

export const VAULT_COLOR_NAMES = [
	"blue",
	"green",
	"magenta",
	"orange",
	"purple",
	"red",
	"yellow",
] as const;

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

/**
 * Parse a "Name=color, Other=blue" preference into a lowercase-name -> colour
 * map. A colour is either a recognised Vicinae colour name or a hex string
 * (e.g. #aabbcc). Malformed or unknown entries are ignored rather than
 * throwing.
 */
export function parseVaultColorPreference(
	preference: string | undefined,
): Record<string, string> {
	const map: Record<string, string> = {};
	if (!preference) return map;
	for (const entry of preference.split(",")) {
		const [rawName, rawColor] = entry.split("=");
		const name = rawName?.trim().toLowerCase();
		const color = rawColor?.trim().toLowerCase();
		if (!name || !color) continue;
		if ((VAULT_COLOR_NAMES as readonly string[]).includes(color)) {
			map[name] = color;
		} else if (HEX_COLOR.test(color)) {
			map[name] = color;
		}
	}
	return map;
}

export function passwordArgs(options: PasswordOptions): string[] {
	return options.type === "random"
		? [
				"password",
				"generate",
				"random",
				...(options.length === undefined
					? []
					: ["--length", String(options.length)]),
				"--numbers",
				String(options.includeNumbers ?? true),
				"--uppercase",
				String(options.includeUppercase ?? true),
				"--symbols",
				String(options.includeSymbols ?? true),
			]
		: [
				"password",
				"generate",
				"passphrase",
				...(options.words === undefined
					? []
					: ["--count", String(options.words)]),
				"--separator",
				options.separator ?? "hyphens",
				"--capitalise",
				String(options.capitalize ?? true),
				"--numbers",
				String(options.includeNumbers ?? true),
			];
}

// Type-specific item fields. Field names come from the pass-cli CreditCardItem
// (cardholder_name, card_type, number, verification_number, expiration_date,
// pin) and IdentityItem protos, so secrets can be flagged and masked in the UI.
const HIDDEN_FIELDS = new Set([
	"number",
	"verification_number",
	"pin",
	"private_key",
	"password",
	"secret",
	"security_code",
]);

const FIELD_LABELS: Record<string, string> = {
	number: "Card number",
	verification_number: "Security code",
	expiration_date: "Expiry date",
	cardholder_name: "Cardholder",
	card_type: "Card type",
	pin: "PIN",
	security_code: "Security code",
	ssid: "Network name",
	private_key: "Private key",
	public_key: "Public key",
};

export type TypedField = { title: string; value: string; hidden?: boolean };

function labelForKey(key: string): string {
	if (FIELD_LABELS[key]) return FIELD_LABELS[key];
	return key
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

/** Flatten a typed content block into labelled, display-ready fields. */
export function typedFieldList(
	data: Record<string, unknown> | undefined,
): TypedField[] {
	if (!data) return [];
	const fields: TypedField[] = [];
	for (const [key, raw] of Object.entries(data)) {
		// `sections` and nested objects/arrays are handled elsewhere.
		if (key === "sections") continue;
		if (raw === null || typeof raw === "object") continue;
		const value = typeof raw === "string" ? raw.trim() : String(raw);
		if (!value) continue;
		fields.push({
			title: labelForKey(key),
			value,
			hidden: HIDDEN_FIELDS.has(key),
		});
	}
	return fields;
}

/**
 * Fields to show for an item type. Logins and notes surface their content via
 * dedicated fields (username/password/note), so they return nothing here.
 */
export function typedFields(
	type: string,
	typed: Record<string, unknown> | undefined,
	login: Record<string, unknown> | undefined,
): TypedField[] | undefined {
	switch (type) {
		case "credit_card":
		case "identity":
		case "wifi":
		case "ssh_key":
		case "custom": {
			const fields = typedFieldList(typed);
			return fields.length ? fields : undefined;
		}
		case "note":
			return undefined;
		default:
			if (login) return undefined;
			{
				const fields = typedFieldList(typed);
				return fields.length ? fields : undefined;
			}
	}
}
