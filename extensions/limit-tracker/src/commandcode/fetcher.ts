import { httpFetch } from "../agents/http.ts";
import type { CommandcodeError, CommandcodeUsage } from "./types.ts";

const COMMANDCODE_API_BASE = "https://api.commandcode.ai";
const COMMANDCODE_USAGE_API = `${COMMANDCODE_API_BASE}/alpha/usage/summary`;
const COMMANDCODE_CREDITS_API = `${COMMANDCODE_API_BASE}/alpha/billing/credits`;
const REQUEST_TIMEOUT = 15000;

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  "individual-go": "Go",
  "individual-goat": "GOAT",
  "individual-pro": "Pro",
  "individual-pro-v1": "Pro",
  "individual-provider": "Provider",
  "individual-max": "Max",
  "individual-ultra": "Ultra",
  "teams-pro": "Teams Pro",
};

function asNum(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function planDisplayName(planId: unknown): string | undefined {
  if (typeof planId !== "string" || !planId.trim()) return undefined;
  const id = planId.trim();
  return PLAN_DISPLAY_NAMES[id] ?? id;
}

function daysUntil(dateValue: unknown): number | null {
  const time = parseDateMs(dateValue);
  if (time === null) return null;
  return Math.max(0, Math.ceil((time - Date.now()) / 86400000));
}

function parseDateMs(dateValue: unknown): number | null {
  if (typeof dateValue !== "string" && typeof dateValue !== "number") return null;
  const time = new Date(dateValue).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Parse the /alpha/usage/summary payload. Pure function (tested).
 * Shapes observed in the command-code 1.46.0 CLI bundle:
 * { subscription: { data: { planId } }, credits: { credits: {
 * monthlyCredits, purchasedCredits, freeCredits }, periodEnd? },
 * summary: { totalCost | used } }. Every field is optional; returns null when
 * nothing usable is present (callers surface parse_error, never zeros).
 */
export function parseCommandcodeUsagePayload(data: unknown): CommandcodeUsage | null {
  const root = asRecord(data);
  if (!root) return null;

  const subscription = asRecord(root.subscription);
  const subData = asRecord(subscription?.data);
  const plan = planDisplayName(subData ? pick(subData, ["planId", "plan_id", "plan"]) : undefined);

  const creditsWrap = asRecord(root.credits);
  const credits = asRecord(creditsWrap?.credits) ?? creditsWrap;
  const monthly = credits ? asNum(pick(credits, ["monthlyCredits", "monthly_credits"])) : undefined;
  const purchased = credits ? asNum(pick(credits, ["purchasedCredits", "purchased_credits"])) : undefined;
  const free = credits ? asNum(pick(credits, ["freeCredits", "free_credits"])) : undefined;
  const total =
    monthly !== undefined || purchased !== undefined || free !== undefined
      ? Math.max(0, monthly ?? 0) + Math.max(0, purchased ?? 0) + Math.max(0, free ?? 0)
      : undefined;

  const summary = asRecord(root.summary);
  const used = summary ? asNum(pick(summary, ["totalCost", "total_cost", "used", "usedCredits", "used_credits"])) : undefined;

  const daysRemaining =
    daysUntil(credits ? pick(credits, ["periodEnd", "period_end", "renewsAt", "renews_at"]) : null) ??
    daysUntil(pick(creditsWrap ?? {}, ["periodEnd", "period_end", "renewsAt", "renews_at"]));
  const renewsAtMs = parseDateMs(
    credits ? pick(credits, ["periodEnd", "period_end", "renewsAt", "renews_at"]) : null,
  ) ?? parseDateMs(pick(creditsWrap ?? {}, ["periodEnd", "period_end", "renewsAt", "renews_at"]));

  if (plan === undefined && total === undefined && used === undefined) return null;

  const usage: CommandcodeUsage = {};
  if (plan !== undefined) usage.plan = plan;
  if (total !== undefined) usage.creditsTotal = total;
  if (used !== undefined) usage.creditsUsed = used;
  if (total !== undefined && total > 0 && used !== undefined) {
    usage.percentUsed = Math.min(100, Math.max(0, (used / total) * 100));
  }
  if (daysRemaining !== null) usage.daysRemaining = daysRemaining;
  if (renewsAtMs !== null) usage.renewsAtMs = renewsAtMs;
  return usage;
}

/**
 * Parse the /alpha/billing/credits fallback payload. Pure function (tested).
 * Only balance-shaped data; percent stays undefined without a total.
 */
export function parseCommandcodeCreditsPayload(data: unknown): CommandcodeUsage | null {
  const root = asRecord(data);
  if (!root) return null;
  const credits = asRecord(root.credits) ?? root;
  const balance = asNum(pick(credits, ["balance", "remaining", "available", "totalBalance", "total_balance"]));
  if (balance === undefined) return null;
  return { creditsTotal: balance };
}

export async function fetchCommandcodeUsage(
  apiKey: string,
): Promise<{ usage: CommandcodeUsage | null; error: CommandcodeError | null }> {
  const { data, error } = await httpFetch({
    url: COMMANDCODE_USAGE_API,
    token: apiKey,
    headers: { Accept: "application/json" },
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "Command Code API key expired or invalid. Run `cmd login` or paste a key from Studio.",
  });
  if (error) {
    if (error.type === "unauthorized") return { usage: null, error: { type: "unauthorized", message: error.message } };
    if (error.type === "network_error") return { usage: null, error: { type: "network_error", message: error.message } };
    return { usage: null, error: { type: "unknown", message: error.message } };
  }

  const parsed = parseCommandcodeUsagePayload(data);
  if (parsed && (parsed.percentUsed !== undefined || parsed.creditsTotal !== undefined || parsed.plan !== undefined)) {
    // Enrich with the billing endpoint only when the summary lacks totals.
    if (parsed.creditsTotal === undefined) {
      const credits = await httpFetch({
        url: COMMANDCODE_CREDITS_API,
        token: apiKey,
        headers: { Accept: "application/json" },
        timeoutMs: REQUEST_TIMEOUT,
      });
      if (!credits.error) {
        const fallback = parseCommandcodeCreditsPayload(credits.data);
        if (fallback?.creditsTotal !== undefined) parsed.creditsTotal = fallback.creditsTotal;
      }
    }
    return { usage: parsed, error: null };
  }

  return {
    usage: null,
    error: {
      type: "parse_error",
      message: "Command Code response did not contain usable quota data.",
    },
  };
}
