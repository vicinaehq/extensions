// Pure helpers for validating extension preferences (unit-tested with vitest).

/** Expand a leading `~` (alone or followed by `/`) to the home directory. */
export function expandHome(input: string, home: string): string {
	const value = input.trim();
	if (value === "~") return home;
	if (value.startsWith("~/"))
		return `${home.replace(/\/+$/, "")}/${value.slice(2)}`;
	return value;
}

export interface ConfigPathChoice {
	/** The file to read, or undefined when auto-detection found nothing. */
	path?: string;
	/** True when the path comes from the `configPath` preference. */
	explicit: boolean;
}

/**
 * Pick the Moonlight.conf to use. A configured path is used as-is (even if it
 * does not exist, so the error can name it); otherwise the first existing
 * auto-detection candidate wins.
 */
export function chooseConfigPath(
	configured: string | undefined,
	candidates: string[],
	exists: (file: string) => boolean,
	home: string,
): ConfigPathChoice {
	const trimmed = configured?.trim();
	if (trimmed) return { path: expandHome(trimmed, home), explicit: true };
	return { path: candidates.find((c) => exists(c)), explicit: false };
}

export const DEFAULT_SERVERINFO_TIMEOUT_S = 3;
export const MIN_SERVERINFO_TIMEOUT_S = 0.5;
export const MAX_SERVERINFO_TIMEOUT_S = 30;

export interface TimeoutSetting {
	ms: number;
	/** Set when the input was invalid and the default was used instead. */
	error?: string;
}

/**
 * Parse the "Host Status Timeout (seconds)" preference. Empty means the
 * default; positive numbers (decimals allowed) are clamped to 0.5–30 s;
 * anything else falls back to the default and reports an error.
 */
export function parseTimeoutSeconds(raw: string | undefined): TimeoutSetting {
	const value = raw?.trim() ?? "";
	const fallback = DEFAULT_SERVERINFO_TIMEOUT_S * 1000;
	if (value === "") return { ms: fallback };
	const seconds = /^(\d+(\.\d*)?|\.\d+)$/.test(value)
		? Number(value)
		: Number.NaN;
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return {
			ms: fallback,
			error: `Host status timeout must be a positive number of seconds (got "${value}"), using ${DEFAULT_SERVERINFO_TIMEOUT_S} s`,
		};
	}
	const clamped = Math.min(
		MAX_SERVERINFO_TIMEOUT_S,
		Math.max(MIN_SERVERINFO_TIMEOUT_S, seconds),
	);
	return { ms: Math.round(clamped * 1000) };
}
