import type { UsageWindow } from "../agents/windowed.ts";
import type { ClinepassUsage } from "./types.ts";

/**
 * Pure parser for the ClinePass plan usage-limits API:
 *   GET https://api.cline.bot/api/v1/users/me/plan/usage-limits
 *   { success: true, data: { limits: [{ type: "five_hour"|"weekly"|"monthly", percentUsed, resetsAt }] } }
 * No @vicinae/api imports — runs under node:test.
 */

const WINDOW_TITLES: Record<string, string> = {
  five_hour: "5-Hour Limit",
  weekly: "Weekly Limit",
  monthly: "Monthly Limit",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toMs(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? Math.round(value) : Math.round(value * 1000);
  }
  return null;
}

export function parseClinepassUsageLimits(data: unknown): ClinepassUsage | "not_object" | "unsuccessful" | "bad_limits" | null {
  const root = asRecord(data);
  if (!root) return "not_object";
  if (root.success !== true) return "unsuccessful";
  const payload = asRecord(root.data);
  if (!payload || !Array.isArray(payload.limits)) return "bad_limits";

  const windows: UsageWindow[] = [];
  for (const entry of payload.limits) {
    const limit = asRecord(entry);
    if (!limit || typeof limit.type !== "string") continue;
    const title = WINDOW_TITLES[limit.type];
    if (!title) continue;
    const percentUsed = typeof limit.percentUsed === "number" && Number.isFinite(limit.percentUsed)
      ? limit.percentUsed
      : null;
    windows.push({
      id: limit.type,
      title,
      usedPercent: percentUsed === null ? null : Math.min(100, Math.max(0, percentUsed)),
      resetsAtMs: toMs(limit.resetsAt),
    });
  }
  if (windows.length === 0) return null;
  return { windows };
}
