import { execFile } from "node:child_process";

export const CLIENTS = "claude,codex,opencode";

export type DayEntry = { client: string; model: string; provider?: string; tokens: number; cost: number };
export type Day = { date: string; entries: DayEntry[] };
export type Snapshot = { fetchedAt: number; days: Day[]; costIncomplete: boolean };

export type ModelTotal = { model: string; tokens: number; cost: number };
export type ToolTotal = { client: string; tokens: number; cost: number; models: ModelTotal[] };
export type PeriodTotal = { tokens: number; cost: number; tools: ToolTotal[] };
export type Periods = { today: PeriodTotal; week: PeriodTotal; month: PeriodTotal };

// Local calendar date as YYYY-MM-DD, the form tokscale uses for `date`.
export function localDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(now: Date, n: number): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
}

// Week = today and the 6 days before it, same as `tokscale --week`.
export function sinceDate(now: Date): string {
	const weekStart = daysAgo(now, 6);
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	return localDate(weekStart < monthStart ? weekStart : monthStart);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// `tokscale graph` output as far as it is read; every field is checked before use.
type RawTokens = { input?: unknown; output?: unknown; cacheRead?: unknown; cacheWrite?: unknown; reasoning?: unknown };
type RawGraphEntry = { client?: unknown; modelId?: unknown; providerId?: unknown; tokens?: RawTokens; cost?: unknown };
type RawGraph = { contributions?: { date?: unknown; clients?: RawGraphEntry[] }[] };

// Throws on anything that is not tokscale graph JSON, so callers show "data unavailable".
export function parseGraph(json: string): Day[] {
	const data = JSON.parse(json) as RawGraph | null;
	if (!Array.isArray(data?.contributions)) throw new Error("tokscale output has no contributions");
	return data.contributions.map((c) => {
		if (typeof c?.date !== "string") throw new Error("tokscale contribution without date");
		const entries = (Array.isArray(c.clients) ? c.clients : []).map((e) => {
			const t = e?.tokens ?? {};
			return {
				client: String(e?.client ?? "unknown"),
				model: String(e?.modelId ?? "unknown"),
				provider: typeof e?.providerId === "string" ? e.providerId : undefined,
				tokens: num(t.input) + num(t.output) + num(t.cacheRead) + num(t.cacheWrite) + num(t.reasoning),
				cost: num(e?.cost),
			};
		});
		return { date: c.date, entries };
	});
}

function total(days: Day[]): PeriodTotal {
	const tools = new Map<string, { tokens: number; cost: number; models: Map<string, ModelTotal> }>();
	for (const day of days) {
		for (const e of day.entries) {
			const tool = tools.get(e.client) ?? { tokens: 0, cost: 0, models: new Map() };
			tool.tokens += e.tokens;
			tool.cost += e.cost;
			const m = tool.models.get(e.model) ?? { model: e.model, tokens: 0, cost: 0 };
			m.tokens += e.tokens;
			m.cost += e.cost;
			tool.models.set(e.model, m);
			tools.set(e.client, tool);
		}
	}
	const list = [...tools].map(([client, t]) => ({
		client,
		tokens: t.tokens,
		cost: t.cost,
		models: [...t.models.values()].sort((a, b) => b.cost - a.cost),
	}));
	list.sort((a, b) => b.cost - a.cost);
	return {
		tokens: list.reduce((s, t) => s + t.tokens, 0),
		cost: list.reduce((s, t) => s + t.cost, 0),
		tools: list,
	};
}

export function periods(days: Day[], now: Date): Periods {
	const today = localDate(now);
	const weekStart = localDate(daysAgo(now, 6));
	const monthStart = today.slice(0, 8) + "01";
	const between = (from: string) => days.filter((d) => d.date >= from && d.date <= today);
	return { today: total(between(today)), week: total(between(weekStart)), month: total(between(monthStart)) };
}

// What the user's own tools spent through one provider, from local logs (list-price estimate).
// Week starts Monday and periods use local days, to line up with OpenRouter's UTC day/week/month
// (shortcut: off by the UTC offset at day boundaries; fine for a share-of-key view).
export function providerSpend(days: Day[], now: Date, provider: string): { today: number; week: number; month: number } {
	const today = localDate(now);
	const weekStart = localDate(daysAgo(now, (now.getDay() + 6) % 7));
	const monthStart = today.slice(0, 8) + "01";
	const sum = (from: string) =>
		days
			.filter((d) => d.date >= from && d.date <= today)
			.reduce((s, d) => s + d.entries.filter((e) => e.provider === provider).reduce((a, e) => a + e.cost, 0), 0);
	return { today: sum(today), week: sum(weekStart), month: sum(monthStart) };
}

// Providers billed to a Claude subscription: Claude Code itself and tools using the Claude agent login.
export const CLAUDE_SUBSCRIPTION_PROVIDERS = ["anthropic", "claude_agent"];

// This calendar month's list-price cost of usage billed to a subscription.
export function subscriptionMonthCost(days: Day[], now: Date, providers: string[]): number {
	const today = localDate(now);
	const monthStart = today.slice(0, 8) + "01";
	return days
		.filter((d) => d.date >= monthStart && d.date <= today)
		.reduce((s, d) => s + d.entries.filter((e) => e.provider && providers.includes(e.provider)).reduce((a, e) => a + e.cost, 0), 0);
}

export function parsePrice(text: string | undefined): number | null {
	const n = Number(String(text ?? "").replace(/[$,\s]/g, ""));
	return Number.isFinite(n) && n > 0 ? n : null;
}

export function fetchSnapshot(now = new Date()): Promise<Snapshot> {
	return new Promise((resolve, reject) => {
		execFile(
			"tokscale",
			["graph", "--since", sinceDate(now), "-c", CLIENTS, "--no-spinner"],
			{ timeout: 120_000, maxBuffer: 64 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) return reject(new Error(stderr.trim() || error.message));
				try {
					resolve({
						fetchedAt: now.getTime(),
						days: parseGraph(stdout),
						costIncomplete: /cost totals may be incomplete/i.test(stderr),
					});
				} catch (e) {
					reject(e);
				}
			},
		);
	});
}

export function formatTokens(n: number): string {
	for (const [div, suffix] of [
		[1e9, "B"],
		[1e6, "M"],
		[1e3, "K"],
	] as const) {
		if (n >= div) return `${(n / div).toFixed(n >= div * 100 ? 0 : 1)}${suffix}`;
	}
	return String(Math.round(n));
}

export function formatCost(n: number): string {
	return `$${n.toFixed(2)}`;
}

export function formatAge(ms: number): string {
	const min = Math.floor(ms / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min} min ago`;
	const h = Math.floor(min / 60);
	return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}
