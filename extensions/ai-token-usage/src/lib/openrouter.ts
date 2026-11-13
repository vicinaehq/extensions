import type { LimitsReport, LimitWindow } from "./limits";

export type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
}>;

const BASE = "https://openrouter.ai/api/v1";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Preference wins; otherwise the env var the user's tools already use.
export function openrouterKey(preference: string | undefined, env = process.env): string | undefined {
	return preference?.trim() || env.OPENROUTER_API_KEY?.trim() || undefined;
}

// OpenRouter `/api/v1/key` and `/api/v1/credits` `data` objects as far as they are read.
export type RawKey = {
	limit?: unknown;
	limit_reset?: unknown;
	limit_remaining?: unknown;
	usage?: unknown;
	usage_daily?: unknown;
	usage_weekly?: unknown;
	usage_monthly?: unknown;
	effective_budget?: { resets_at?: unknown } | null;
};
export type RawCredits = { total_credits?: unknown; total_usage?: unknown };

const PERIOD_LABEL: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export function keyWindow(data: RawKey | undefined): LimitWindow | null {
	const limit = num(data?.limit);
	if (!limit || limit <= 0) return null;
	const reset = String(data?.limit_reset ?? "").toLowerCase();
	const usedField = ({ daily: "usage_daily", weekly: "usage_weekly", monthly: "usage_monthly" } as const)[reset] ?? "usage";
	const remaining = num(data?.limit_remaining);
	// OpenRouter's own remaining figure is authoritative over limit - usage
	const used = remaining !== null ? limit - remaining : (num(data?.[usedField]) ?? 0);
	const resetsAt = data?.effective_budget?.resets_at;
	return {
		label: `${PERIOD_LABEL[reset] ?? "API key"} limit`,
		usedPercent: Math.round((Math.max(0, used) / limit) * 100),
		resetsAt: typeof resetsAt === "string" ? resetsAt : undefined,
		resetText: typeof resetsAt === "string" ? undefined : PERIOD_LABEL[reset]?.toLowerCase(),
		amount: { used: Math.max(0, used), total: limit },
	};
}

export function creditsWindow(data: RawCredits | undefined): LimitWindow | null {
	const total = num(data?.total_credits);
	const used = num(data?.total_usage);
	if (total === null || used === null || total <= 0) return null;
	return { label: "Credits", usedPercent: Math.round((used / total) * 100), amount: { used, total } };
}

// usage_daily/weekly/monthly are this key's spend in OpenRouter's current UTC day, week and month
export function keySpend(data: RawKey | undefined): { today: number; week: number; month: number } | undefined {
	const [today, week, month] = [num(data?.usage_daily), num(data?.usage_weekly), num(data?.usage_monthly)];
	return today === null || week === null || month === null ? undefined : { today, week, month };
}

export async function fetchOpenRouterLimits(key: string | undefined, fetchFn: Fetch = fetch): Promise<LimitsReport | null> {
	if (!key) return null; // not configured: no row
	const get = async (path: string) => {
		const res = await fetchFn(`${BASE}${path}`, {
			headers: { Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "API key rejected" : `HTTP ${res.status}`);
		return ((await res.json()) as { data?: unknown } | null)?.data;
	};
	const [credits, keyInfo] = await Promise.allSettled([get("/credits"), get("/key")]);
	const windows = [
		credits.status === "fulfilled" ? creditsWindow(credits.value as RawCredits) : null,
		keyInfo.status === "fulfilled" ? keyWindow(keyInfo.value as RawKey) : null,
	].filter((w): w is LimitWindow => w !== null);
	const spend = keyInfo.status === "fulfilled" ? keySpend(keyInfo.value as RawKey) : undefined;
	if (windows.length > 0) return { provider: "OpenRouter", available: true, source: "openrouter.ai API", windows, spend };
	const failure = [credits, keyInfo].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
	return { provider: "OpenRouter", available: false, reason: failure ? String(failure.reason?.message ?? failure.reason) : "no credit data" };
}
