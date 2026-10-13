import type { UsageWindow } from "../agents/windowed.ts";
import type { GrokUsage } from "./types.ts";

/**
 * Pure parsers for the Grok CLI-proxy billing API. No @vicinae/api imports.
 *
 *   GET https://cli-chat-proxy.grok.com/v1/billing?format=credits
 *   { config: { creditUsagePercent, currentPeriod: {start,end}, billingPeriodEnd,
 *               onDemandUsed: {val}, onDemandCap: {val} } }
 *
 *   GET https://cli-chat-proxy.grok.com/v1/settings → { subscription_tier_display }
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

function toMs(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const n = asNum(value);
  if (n === undefined || n <= 0) return null;
  return n > 1e12 ? Math.round(n) : n > 1e6 ? Math.round(n * 1000) : null;
}

/**
 * Parse the credits response into one usage window. A parseable payload with no
 * published percentage yields a window with `usedPercent: null` ("unknown"),
 * never a fabricated zero — matching the upstream honesty contract.
 */
export function parseGrokCredits(data: unknown): GrokUsage | null {
  const root = asRecord(data);
  const config = asRecord(root?.config) ?? root;
  if (!config) return null;

  let usedPercent: number | null = null;
  const direct = asNum(config.creditUsagePercent ?? config.credit_usage_percent);
  if (direct !== undefined) {
    usedPercent = direct <= 1 ? direct * 100 : direct;
  } else {
    const used = asNum(asRecord(config.onDemandUsed)?.val ?? config.onDemandUsed);
    const cap = asNum(asRecord(config.onDemandCap)?.val ?? config.onDemandCap);
    if (used !== undefined && cap !== undefined && cap > 0) usedPercent = (used / cap) * 100;
  }

  const period = asRecord(config.currentPeriod) ?? asRecord(config.current_period);
  const resetsAtMs = toMs(period?.end) ?? toMs(config.billingPeriodEnd) ?? toMs(config.billing_period_end);

  const hasSignal = usedPercent !== null || resetsAtMs !== null;
  if (!hasSignal) return null;

  const window: UsageWindow = {
    id: "credits",
    title: "Credits",
    usedPercent: usedPercent === null ? null : Math.min(100, Math.max(0, usedPercent)),
    resetsAtMs,
    note: usedPercent === null ? "usage unknown" : undefined,
  };
  return { windows: [window] };
}

export function parseGrokSettingsTier(data: unknown): string | null {
  const root = asRecord(data);
  const tier = root?.subscription_tier_display ?? root?.subscriptionTierDisplay;
  return typeof tier === "string" && tier.trim() ? tier.trim() : null;
}
