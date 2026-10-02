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
