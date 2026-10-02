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

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
	Consecutive: "Has consecutive characters",
	Progressive: "Has a progressive/sequential pattern",
	Short: "Too short",
	TooShort: "Too short",
	NoUppercase: "No uppercase letters",
	NoLowercase: "No lowercase letters",
	NoNumbers: "No numbers",
	NoSymbols: "No symbols",
	Repetitive: "Repetitive characters",
	Sequential: "Sequential pattern detected",
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
