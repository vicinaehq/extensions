import type { UsageWindow } from "../agents/windowed.ts";
import type { DroidUsage } from "./types.ts";

/**
 * Pure parsers for the Factory (Droid) APIs. No @vicinae/api imports.
 *
 * Token-rate-limits billing:
 *   GET https://api.factory.ai/api/billing/limits
 *   { usesTokenRateLimitsBilling, limits: { standard: { fiveHour, weekly, monthly }, core? },
 *     extraUsageBalanceCents, extraUsageAllowed }
 *   window: { usedPercent, windowEnd?, secondsRemaining? }
 *
 * Legacy billing fallback:
 *   GET https://app.factory.ai/api/organization/subscription/usage?useCache=true
 *   { usage: { startDate, endDate, standard: { userTokens, totalAllowance, usedRatio }, premium: {...} } }
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNum(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** ISO string or epoch s/ms → ms. */
function toMs(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const n = asNum(value);
  if (n === undefined || n <= 0) return null;
  return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
}

function billingWindow(entry: unknown, id: string, title: string, nowMs: number): UsageWindow | null {
  const record = asRecord(entry);
  if (!record) return null;
  const usedPercent = asNum(record.usedPercent);
  if (usedPercent === undefined) return null;
  const secondsRemaining = asNum(record.secondsRemaining);
  const resetsAtMs =
    secondsRemaining !== undefined && secondsRemaining > 0
      ? nowMs + secondsRemaining * 1000
      : toMs(record.windowEnd);
  return {
    id,
    title,
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    resetsAtMs,
  };
}

const POOL_WINDOWS = [
  { key: "fiveHour", title: "5-Hour Limit" },
  { key: "weekly", title: "Weekly Limit" },
  { key: "monthly", title: "Monthly Limit" },
] as const;

/** Parse the token-rate-limits billing response; null when the shape doesn't apply. */
export function parseFactoryBillingLimits(data: unknown, nowMs: number = Date.now()): DroidUsage | null {
  const root = asRecord(data);
  if (!root || root.usesTokenRateLimitsBilling !== true) return null;
  const limits = asRecord(root.limits);
  if (!limits) return null;

  const windows: UsageWindow[] = [];
  for (const [poolKey, poolName] of [
    ["standard", "Standard"],
    ["core", "Core"],
  ] as const) {
    const pool = asRecord(limits[poolKey]);
    if (!pool) continue;
    for (const win of POOL_WINDOWS) {
      const title = poolKey === "standard" ? win.title : `${poolName} — ${win.title}`;
      const parsed = billingWindow(pool[win.key], `${poolKey}-${win.key}`, title, nowMs);
      if (parsed) windows.push(parsed);
    }
  }
  if (windows.length === 0) return null;

  const extras: { title: string; text: string }[] = [];
  const balanceCents = asNum(root.extraUsageBalanceCents);
  if (balanceCents !== undefined && balanceCents > 0) {
    extras.push({ title: "Extra Usage Balance", text: `$${(balanceCents / 100).toFixed(2)}` });
  }

  return { windows, extras };
}

function tokenPool(entry: unknown, id: string, title: string, resetsAtMs: number | null): UsageWindow | null {
  const record = asRecord(entry);
  if (!record) return null;
  const used = asNum(record.userTokens);
  const allowance = asNum(record.totalAllowance);
  const ratio = asNum(record.usedRatio);
  let usedPercent: number | null = null;
  if (ratio !== undefined) usedPercent = ratio <= 1 ? ratio * 100 : ratio;
  else if (used !== undefined && allowance !== undefined && allowance > 0) usedPercent = (used / allowance) * 100;
  if (usedPercent === null) return null;
  return {
    id,
    title,
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    resetsAtMs,
    valueText: used !== undefined && allowance !== undefined ? `${used}/${allowance} tokens` : undefined,
  };
}

/** Parse the legacy subscription-usage response (Standard/Premium token pools). */
export function parseFactorySubscriptionUsage(data: unknown): DroidUsage | null {
  const root = asRecord(data);
  const usage = asRecord(root?.usage);
  if (!usage) return null;
  const resetsAtMs = toMs(usage.endDate);
  const windows = [
    tokenPool(usage.standard, "standard", "Standard Tokens", resetsAtMs),
    tokenPool(usage.premium, "premium", "Premium Tokens", resetsAtMs),
  ].filter((w): w is UsageWindow => w !== null);
  if (windows.length === 0) return null;
  return { windows };
}
