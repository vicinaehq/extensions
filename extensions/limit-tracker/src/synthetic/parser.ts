import type { UsageWindow } from "../agents/windowed.ts";
import type { SyntheticUsage } from "./types.ts";

/**
 * Pure parser for the Synthetic quota API:
 *   GET https://api.synthetic.new/v2/quotas
 * Known lanes: rollingFiveHourLimit, weeklyTokenLimit, search.hourly — either at
 * the root or under `data`. Falls back to generic quota containers
 * (quotas/quota/limits/usage/entries/subscription). Defensive by design: unknown
 * shapes degrade instead of throwing.
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

const USED_PERCENT_KEYS = ["percent_used", "percentUsed", "used_percent", "usedPercent", "usage_percent", "usagePercent", "percent"];
const USED_KEYS = ["used", "usage", "consumed", "used_count", "usedCount"];
const LIMIT_KEYS = ["limit", "quota", "total", "max", "cap"];
const REMAINING_KEYS = ["remaining", "left", "available"];
const REMAINING_PERCENT_KEYS = ["remaining_percent", "remainingPercent", "percent_remaining", "percentRemaining"];
const RESET_KEYS = ["resetsAt", "resetAt", "reset_at", "resetTime", "resets_at", "windowEnd", "window_end"];
const WINDOW_SECONDS_KEYS = ["windowSeconds", "window_seconds", "durationSeconds", "seconds", "periodSeconds"];

function toMs(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const n = asNum(value);
  if (n === undefined || n <= 0) return null;
  return n > 1e12 ? Math.round(n) : n > 1e6 ? Math.round(n * 1000) : null;
}

function firstNum(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const n = asNum(record[key]);
    if (n !== undefined) return n;
  }
  return undefined;
}

/** Percent used in 0..100 from percent fields, remaining-percent, or used/limit. */
function entryUsedPercent(entry: Record<string, unknown>): number | null {
  const direct = firstNum(entry, USED_PERCENT_KEYS);
  if (direct !== undefined) return direct <= 1 ? direct * 100 : direct;
  const remainingPct = firstNum(entry, REMAINING_PERCENT_KEYS);
  if (remainingPct !== undefined) return 100 - (remainingPct <= 1 ? remainingPct * 100 : remainingPct);
  const used = firstNum(entry, USED_KEYS);
  const limit = firstNum(entry, LIMIT_KEYS);
  if (used !== undefined && limit !== undefined && limit > 0) return (used / limit) * 100;
  const remaining = firstNum(entry, REMAINING_KEYS);
  if (remaining !== undefined && limit !== undefined && limit > 0) return ((limit - remaining) / limit) * 100;
  return null;
}

function entryValueText(entry: Record<string, unknown>): string | undefined {
  const used = firstNum(entry, USED_KEYS);
  const limit = firstNum(entry, LIMIT_KEYS);
  if (used !== undefined && limit !== undefined) return `${used}/${limit}`;
  const remaining = firstNum(entry, REMAINING_KEYS);
  if (remaining !== undefined && limit !== undefined) return `${remaining} left of ${limit}`;
  return undefined;
}

function entryResetMs(entry: Record<string, unknown>, nowMs: number): number | null {
  for (const key of RESET_KEYS) {
    const ms = toMs(entry[key]);
    if (ms !== null) return ms;
  }
  const windowSeconds = firstNum(entry, WINDOW_SECONDS_KEYS);
  return windowSeconds !== undefined && windowSeconds > 0 ? nowMs + windowSeconds * 1000 : null;
}

function toWindow(id: string, title: string, entry: unknown, nowMs: number): UsageWindow | null {
  const record = asRecord(entry);
  if (!record) return null;
  const usedPercent = entryUsedPercent(record);
  if (usedPercent === null) return null;
  return {
    id,
    title,
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    resetsAtMs: entryResetMs(record, nowMs),
    valueText: entryValueText(record),
  };
}

const KNOWN_LANES: { key: string; title: string }[] = [
  { key: "rollingFiveHourLimit", title: "5-Hour Quota" },
  { key: "weeklyTokenLimit", title: "Weekly Tokens" },
  { key: "search.hourly", title: "Search Hourly" },
];

const GENERIC_CONTAINERS = ["quotas", "quota", "limits", "usage", "entries", "subscription"];
const NAME_KEYS = ["name", "key", "label", "id", "type", "kind"];

export function parseSyntheticQuotas(data: unknown, nowMs: number = Date.now()): SyntheticUsage | null {
  const root = asRecord(data);
  if (!root) return null;
  const scope = asRecord(root.data) ?? root;

  const windows: UsageWindow[] = [];
  for (const lane of KNOWN_LANES) {
    const win = toWindow(lane.key, lane.title, scope[lane.key], nowMs);
    if (win) windows.push(win);
  }

  if (windows.length === 0) {
    for (const key of GENERIC_CONTAINERS) {
      const container = scope[key];
      const entries = Array.isArray(container) ? container : asRecord(container) ? Object.values(asRecord(container)!) : [];
      for (const [index, entry] of entries.entries()) {
        const record = asRecord(entry);
        const name = record ? NAME_KEYS.map((k) => record[k]).find((v): v is string => typeof v === "string") : undefined;
        const win = toWindow(`${key}-${index}`, name?.trim() || `Quota ${index + 1}`, entry, nowMs);
        if (win) windows.push(win);
      }
      if (windows.length > 0) break;
    }
  }

  if (windows.length === 0) return null;
  const plan = ["plan", "planName", "tier", "subscription_tier"]
    .map((key) => scope[key] ?? root[key])
    .find((v): v is string => typeof v === "string" && v.trim() !== "");
  return { plan: plan?.trim() ?? null, windows };
}
