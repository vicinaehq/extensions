import type { UsageWindow } from "../agents/windowed.ts";
import type { KimiUsage } from "./types.ts";

/**
 * Pure parser for the Kimi Code usages API:
 *   GET https://api.kimi.com/coding/v1/usages
 *   { usage: {limit, used, remaining, resetTime}, limits: [{window:{duration,timeUnit}, detail:{...}}], membership? }
 * Numbers arrive as strings. No @vicinae/api imports — runs under node:test.
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

/** ISO timestamp or epoch s/ms → ms. */
function toMs(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const n = asNum(value);
  if (n === undefined || n <= 0) return null;
  return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
}

function formatCount(used: number | undefined, limit: number | undefined): string | undefined {
  if (used === undefined || limit === undefined) return undefined;
  return `${used}/${limit}`;
}

function windowTitle(duration: number | undefined, timeUnit: unknown): string {
  if (timeUnit === "TIME_UNIT_MINUTE" && duration !== undefined) {
    if (duration === 300) return "5-Hour Limit";
    if (duration === 60) return "Hourly Limit";
    return `${duration}-Minute Limit`;
  }
  if (timeUnit === "TIME_UNIT_HOUR" && duration !== undefined) {
    if (duration === 5) return "5-Hour Limit";
    return `${duration}-Hour Limit`;
  }
  if (timeUnit === "TIME_UNIT_DAY" && duration !== undefined) {
    if (duration === 7) return "Weekly Limit";
    if (duration === 1) return "Daily Limit";
    return `${duration}-Day Limit`;
  }
  return "Rate Limit";
}

function detailToWindow(id: string, title: string, detail: unknown): UsageWindow | null {
  const d = asRecord(detail);
  if (!d) return null;
  const limit = asNum(d.limit);
  const used = asNum(d.used);
  const remaining = asNum(d.remaining);
  let usedPercent: number | null = null;
  if (limit !== undefined && limit > 0 && used !== undefined) {
    usedPercent = (used / limit) * 100;
  } else if (limit !== undefined && limit > 0 && remaining !== undefined) {
    usedPercent = ((limit - remaining) / limit) * 100;
  }
  return {
    id,
    title,
    usedPercent,
    resetsAtMs: toMs(d.resetTime),
    valueText: formatCount(used, limit),
  };
}

/** Parse a Kimi usages payload (Code API or the web GetUsages `usages[]` entry). */
export function parseKimiUsage(data: unknown): KimiUsage | null {
  const root = asRecord(data);
  if (!root) return null;

  const weekly = detailToWindow("weekly", "Weekly Quota", root.usage);
  const rateWindows: UsageWindow[] = [];
  if (Array.isArray(root.limits)) {
    for (const [index, entry] of root.limits.entries()) {
      const e = asRecord(entry);
      if (!e) continue;
      const win = asRecord(e.window);
      const win2 = detailToWindow(
        `rate-${index}`,
        windowTitle(asNum(win?.duration), win?.timeUnit),
        e.detail,
      );
      if (win2) rateWindows.push(win2);
    }
  }

  const windows = [weekly, ...rateWindows].filter((w): w is UsageWindow => w !== null);
  if (windows.length === 0) return null;

  const membership = ["membership", "tier", "plan", "membershipLevel", "membership_level"]
    .map((key) => root[key])
    .find((v): v is string => typeof v === "string" && v.trim() !== "");

  return { plan: membership?.trim() ?? null, windows };
}
