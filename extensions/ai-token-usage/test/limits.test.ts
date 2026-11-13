import { expect, test } from "bun:test";
import {
	fetchClaudeLimits,
	fetchLimits,
	formatReset,
	type LimitsProvider,
	isFresh,
	mergeReport,
	nextResetBoundary,
	parseClaudeUsageText,
	parseRateLimit,
	type Runner,
} from "../src/lib/limits";

const TOKSCALE = JSON.stringify([
	{
		provider: "Claude",
		plan: "Max 5x",
		metrics: [
			{ label: "Session", used_percent: 9, resets_at: "2026-11-12T22:19:59Z" },
			{ label: "Weekly", used_percent: 20, resets_at: "2026-11-15T19:59:59Z" },
			{ label: "Fable", used_percent: 2, resets_at: "2026-11-15T19:59:59Z" },
		],
	},
]);

const CLI = `You are currently using your subscription to power your Claude Code usage

Current session: 5% used · resets Nov 13, 1:49pm (Europe/Berlin)
Current week (all models): 21% used · resets Nov 15, 8:59pm (Europe/Berlin)
Current week (Fable): 2% used · resets Nov 15, 8:59pm (Europe/Berlin)

Last 24h · 805 requests · 11 sessions
  71%  Start fresh when you switch tasks · run /clear`;

const runner =
	(outputs: Record<string, string | Error>): Runner =>
	async (cmd, args) => {
		const out = outputs[args.includes("--light") ? `${cmd} --light` : cmd] ?? (args.includes("--light") ? "" : undefined);
		if (out === undefined || out instanceof Error) throw out ?? new Error(`${cmd} not stubbed`);
		return out;
	};

test("route 1: tokscale usage", async () => {
	const r = await fetchClaudeLimits(runner({ tokscale: TOKSCALE, claude: new Error("must not run") }));
	expect(r).toMatchObject({ available: true, plan: "Max 5x", source: "tokscale" });
	if (r.available) expect(r.windows.map((w) => [w.label, w.usedPercent])).toEqual([["Session (5h)", 9], ["Weekly", 20], ["Fable", 2]]);
});

test("route 2 when tokscale omits Claude", async () => {
	const r = await fetchClaudeLimits(runner({ tokscale: "[]", claude: CLI }));
	expect(r).toMatchObject({ available: true, source: "claude /usage" });
	if (r.available)
		expect(r.windows).toEqual([
			{ label: "Session (5h)", usedPercent: 5, resetText: "Nov 13, 1:49pm" },
			{ label: "Weekly", usedPercent: 21, resetText: "Nov 15, 8:59pm" },
			{ label: "Fable", usedPercent: 2, resetText: "Nov 15, 8:59pm" },
		]);
});

test("route 2 when tokscale fails or returns garbage", async () => {
	expect((await fetchClaudeLimits(runner({ tokscale: new Error("boom"), claude: CLI }))).available).toBe(true);
	expect((await fetchClaudeLimits(runner({ tokscale: "not json", claude: CLI }))).available).toBe(true);
});

test("both routes failing is unavailable, not a throw", async () => {
	const r = await fetchClaudeLimits(runner({ tokscale: "[]", claude: "Some other text" }));
	expect(r.available).toBe(false);
});

test("usage text without limit lines parses to nothing", () => {
	expect(parseClaudeUsageText("You are using an API key")).toEqual([]);
});

test("formatReset", () => {
	const now = Date.parse("2026-11-13T10:00:00Z");
	expect(formatReset({ label: "x", usedPercent: 1, resetsAt: "2026-11-13T12:30:00Z" }, now)).toBe("resets in 2h 30m");
	expect(formatReset({ label: "x", usedPercent: 1, resetsAt: "2026-11-15T13:00:00Z" }, now)).toBe("resets in 2d 3h");
	expect(formatReset({ label: "x", usedPercent: 1, resetText: "Nov 13, 1:49pm" }, now)).toBe("resets Nov 13, 1:49pm");
});

const good = { provider: "Claude Code", available: true as const, source: "tokscale", windows: [{ label: "Weekly", usedPercent: 21 }] };
const bad = { provider: "Claude Code", available: false as const, reason: "rate-limited" };

test("a failed fetch keeps the last good values, marked stale, and backs off 15 min", () => {
	const r = mergeReport(bad, good, 1_000, 10_000);
	expect(r).toMatchObject({ available: true, stale: { reason: "rate-limited", asOf: 1_000 }, retryAfter: 10_000 + 15 * 60_000 });
	// a second failure keeps the original "as of" time
	expect(mergeReport(bad, r, 10_000, 20_000)).toMatchObject({ stale: { asOf: 1_000 } });
	expect(mergeReport(good, r, 10_000, 20_000)).toEqual(good);
	expect(mergeReport(bad, undefined, 0, 5)).toMatchObject({ available: false, retryAfter: 5 + 15 * 60_000 });
});

test("fetchLimits does not call a provider while it backs off", async () => {
	let calls = 0;
	const provider: LimitsProvider = { id: "claude", name: "Claude Code", readsCredentials: false, fetch: async () => (calls++, bad) };
	const first = await fetchLimits([provider], { fetchedAt: 0, reports: [good] }, 1_000);
	expect(calls).toBe(1);
	expect(first.reports[0]).toMatchObject({ available: true, stale: { asOf: 0 } });
	await fetchLimits([provider], first, 2_000);
	expect(calls).toBe(1);
	await fetchLimits([provider], first, 1_000 + 15 * 60_000 + 1);
	expect(calls).toBe(2);
});

test("rate limit: reason and retry time from tokscale, no claude fallback", async () => {
	expect(parseRateLimit("Claude: rate-limited; retry in 1823s — skipped")).toBe(1823);
	expect(parseRateLimit("╭──╮\n│ Claude │")).toBeNull();
	const r = await fetchClaudeLimits(
		runner({ tokscale: "[]", "tokscale --light": "Claude: rate-limited; retry in 1823s — skipped", claude: new Error("must not run") }),
	);
	expect(r).toMatchObject({ available: false, reason: "Anthropic is rate-limiting the usage endpoint; retry in 31 min" });
	if (!r.available) expect(r.retryAfter).toBeGreaterThan(Date.now() + 1800_000);
});

test("reset boundary: cache goes stale 30 s after a window resets", () => {
	const t0 = Date.parse("2026-11-13T10:00:00Z");
	const snap = {
		fetchedAt: t0,
		reports: [
			{
				provider: "Claude Code",
				available: true as const,
				source: "tokscale",
				windows: [
					{ label: "Session (5h)", usedPercent: 90, resetsAt: "2026-11-13T10:02:00Z" },
					{ label: "Weekly", usedPercent: 20, resetsAt: "2026-11-15T20:00:00Z" },
					{ label: "Old", usedPercent: 1, resetsAt: "2026-11-13T09:00:00Z" }, // already past at fetch time
				],
			},
		],
	};
	expect(nextResetBoundary(snap)).toBe(Date.parse("2026-11-13T10:02:30Z"));
	expect(isFresh(snap, Date.parse("2026-11-13T10:02:29Z"))).toBe(true);
	expect(isFresh(snap, Date.parse("2026-11-13T10:02:30Z"))).toBe(false);
	expect(isFresh(snap, t0 + 5 * 60_000)).toBe(false);
	expect(nextResetBoundary({ fetchedAt: t0, reports: [] })).toBeNull();
});
