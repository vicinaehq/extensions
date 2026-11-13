import { expect, test } from "bun:test";
import { creditsWindow, type Fetch, fetchOpenRouterLimits, keyWindow, openrouterKey } from "../src/lib/openrouter";

const KEY = {
	limit: 100,
	limit_reset: "monthly",
	limit_remaining: 64.47,
	usage_daily: 2.94,
	usage_weekly: 31.61,
	usage_monthly: 35.53,
	effective_budget: { resets_at: "2026-12-01T00:00:00.000Z" },
};
const CREDITS = { total_credits: 7655, total_usage: 6273.28 };

const fake =
	(routes: Record<string, { status: number; data?: unknown }>): Fetch =>
	async (url, init) => {
		expect(init.headers.Authorization).toBe("Bearer sk-test");
		const r = routes[url.replace("https://openrouter.ai/api/v1", "")];
		return { ok: r.status === 200, status: r.status, json: async () => ({ data: r.data }) };
	};

test("key: preference beats env, blanks fall through", () => {
	expect(openrouterKey(" sk-pref ", { OPENROUTER_API_KEY: "sk-env" })).toBe("sk-pref");
	expect(openrouterKey("", { OPENROUTER_API_KEY: "sk-env" })).toBe("sk-env");
	expect(openrouterKey(undefined, {})).toBeUndefined();
});

test("no key means no row", async () => {
	expect(await fetchOpenRouterLimits(undefined)).toBeNull();
});

test("credits and monthly key limit", async () => {
	const r = await fetchOpenRouterLimits("sk-test", fake({ "/credits": { status: 200, data: CREDITS }, "/key": { status: 200, data: KEY } }));
	expect(r).toMatchObject({ provider: "OpenRouter", available: true });
	if (!r?.available) throw new Error("expected available");
	expect(r.windows[0]).toMatchObject({ label: "Credits", usedPercent: 82, amount: { used: 6273.28, total: 7655 } });
	expect(r.spend).toEqual({ today: 2.94, week: 31.61, month: 35.53 });
	expect(r.windows[1]).toMatchObject({ label: "Monthly limit", usedPercent: 36, resetsAt: "2026-12-01T00:00:00.000Z" });
});

test("key without a limit shows only credits; one failing call does not hide the other", async () => {
	const r = await fetchOpenRouterLimits("sk-test", fake({ "/credits": { status: 200, data: CREDITS }, "/key": { status: 500 } }));
	expect(r?.available && r.windows.map((w) => w.label)).toEqual(["Credits"]);
	expect(keyWindow({ limit: null })).toBeNull();
	expect(creditsWindow({ total_credits: 0, total_usage: 0 })).toBeNull();
});

test("rejected key is unavailable with a reason", async () => {
	const r = await fetchOpenRouterLimits("sk-test", fake({ "/credits": { status: 401 }, "/key": { status: 401 } }));
	expect(r).toEqual({ provider: "OpenRouter", available: false, reason: "API key rejected" });
});
