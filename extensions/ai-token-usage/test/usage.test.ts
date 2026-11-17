import { expect, test } from "bun:test";
import {
	CLAUDE_SUBSCRIPTION_PROVIDERS,
	formatTokens,
	parseGraph,
	parsePrice,
	periods,
	providerSpend,
	sinceDate,
	subscriptionMonthCost,
} from "../src/lib/usage";

const graph = (days: { date: string; clients: unknown[] }[]) => JSON.stringify({ meta: {}, contributions: days });
const entry = (client: string, modelId: string, output: number, cost: number) => ({
	client,
	modelId,
	tokens: { input: 1, output, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
	cost,
});

test("sinceDate covers the 7-day week even when it starts in the previous month", () => {
	expect(sinceDate(new Date(2026, 10, 3))).toBe("2026-10-28");
	expect(sinceDate(new Date(2026, 10, 20))).toBe("2026-11-01");
});

test("parseGraph rejects non-graph output", () => {
	expect(() => parseGraph("{}")).toThrow();
	expect(() => parseGraph("not json")).toThrow();
});

test("periods split today, 7-day week and calendar month, by tool and model", () => {
	const days = parseGraph(
		graph([
			{ date: "2026-10-30", clients: [entry("claude", "opus", 99, 10)] },
			{ date: "2026-11-01", clients: [entry("codex", "gpt", 9, 1)] },
			{
				date: "2026-11-03",
				clients: [entry("claude", "opus", 19, 2), entry("claude", "sonnet", 4, 0.5), entry("codex", "gpt", 9, 3)],
			},
		]),
	);
	const p = periods(days, new Date(2026, 10, 3, 12));
	expect(p.today.cost).toBe(5.5);
	expect(p.today.tokens).toBe(20 + 5 + 10);
	expect(p.today.tools.map((t) => t.client)).toEqual(["codex", "claude"]);
	expect(p.today.tools[1].models.map((m) => m.model)).toEqual(["opus", "sonnet"]);
	expect(p.week.cost).toBe(16.5);
	expect(p.month.cost).toBe(6.5);
	const toolSum = p.week.tools.reduce((s, t) => s + t.models.reduce((a, m) => a + m.cost, 0), 0);
	expect(toolSum).toBe(p.week.cost);
});

test("formatTokens", () => {
	expect(formatTokens(1_988_041_262)).toBe("2.0B");
	expect(formatTokens(8_194_105)).toBe("8.2M");
	expect(formatTokens(512)).toBe("512");
});

test("providerSpend counts only that provider's entries", () => {
	const days = parseGraph(
		graph([
			{ date: "2026-11-02", clients: [{ ...entry("codex", "gpt", 1, 1.5), providerId: "openrouter" }] },
			{
				date: "2026-11-03",
				clients: [{ ...entry("codex", "gpt", 1, 2), providerId: "openrouter" }, { ...entry("claude", "opus", 1, 9), providerId: "anthropic" }],
			},
		]),
	);
	expect(providerSpend(days, new Date(2026, 10, 3, 12), "openrouter")).toEqual({ today: 2, week: 3.5, month: 3.5 });
});

test("providerSpend week starts on Monday", () => {
	const days = parseGraph(
		graph([
			{ date: "2026-11-01", clients: [{ ...entry("codex", "gpt", 1, 5), providerId: "openrouter" }] }, // Sunday
			{ date: "2026-11-02", clients: [{ ...entry("codex", "gpt", 1, 1), providerId: "openrouter" }] }, // Monday
		]),
	);
	expect(providerSpend(days, new Date(2026, 10, 4, 12), "openrouter").week).toBe(1);
});

test("subscriptionMonthCost counts Claude Code and OpenCode-via-Claude this month only", () => {
	const days = parseGraph(
		graph([
			{ date: "2026-10-31", clients: [{ ...entry("claude", "opus", 1, 50), providerId: "anthropic" }] },
			{
				date: "2026-11-03",
				clients: [
					{ ...entry("claude", "opus", 1, 300), providerId: "anthropic" },
					{ ...entry("opencode", "sonnet", 1, 20), providerId: "claude_agent" },
					{ ...entry("codex", "gpt", 1, 3), providerId: "openrouter" },
				],
			},
		]),
	);
	expect(subscriptionMonthCost(days, new Date(2026, 10, 3, 12), CLAUDE_SUBSCRIPTION_PROVIDERS)).toBe(320);
});

test("parsePrice", () => {
	expect(parsePrice("100")).toBe(100);
	expect(parsePrice(" $1,000 ")).toBe(1000);
	expect(parsePrice("")).toBeNull();
	expect(parsePrice("abc")).toBeNull();
	expect(parsePrice("0")).toBeNull();
});
