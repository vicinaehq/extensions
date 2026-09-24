import type { UsageWindow } from "../agents/windowed.ts";
import type { MinimaxUsage } from "./types.ts";

/**
 * Pure parser for the MiniMax remains endpoints:
 *   GET {apiBase}/v1/token_plan/remains          (newer)
 *   GET {apiBase}/v1/api/openplatform/coding_plan/remains
 * Response carries a `model_remains` array (possibly nested under `data`) where
 * each entry reports a current-interval (≈5h) window and a weekly window via
 * *_remaining_percent / *_usage_count / *_total_count and epoch-second bounds.
 * `base_resp.status_code !== 0` is an API-level error.
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

function epochToMs(value: unknown): number | null {
  const n = asNum(value);
  if (n === undefined || n <= 0) return null;
  return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
}

export interface MinimaxRemainsResult {
  usage: MinimaxUsage | null;
  /** API-level error text (base_resp.status_msg), when reported. */
  apiError: string | null;
}

function modelWindows(model: Record<string, unknown>, index: number, nowMs: number): UsageWindow[] {
  const modelName =
    typeof model.model_name === "string" && model.model_name.trim() ? model.model_name.trim() : `Model ${index + 1}`;
  const prefix = (title: string) => `${modelName} — ${title}`;

  const windows: UsageWindow[] = [];
  const intervalRemaining = asNum(model.current_interval_remaining_percent);
  const intervalUsed = asNum(model.current_interval_usage_count);
  const intervalTotal = asNum(model.current_interval_total_count);
  const intervalUsedPercent =
    intervalRemaining !== undefined
      ? 100 - intervalRemaining
      : intervalUsed !== undefined && intervalTotal !== undefined && intervalTotal > 0
        ? (intervalUsed / intervalTotal) * 100
        : null;
  if (intervalUsedPercent !== null) {
    windows.push({
      id: `m${index}-interval`,
      title: prefix("5-Hour"),
      usedPercent: Math.min(100, Math.max(0, intervalUsedPercent)),
      resetsAtMs: epochToMs(model.end_time) ?? null,
      valueText:
        intervalUsed !== undefined && intervalTotal !== undefined ? `${intervalUsed}/${intervalTotal}` : undefined,
    });
  }

  const weeklyRemaining = asNum(model.current_weekly_remaining_percent);
  const weeklyUsed = asNum(model.current_weekly_usage_count);
  const weeklyTotal = asNum(model.current_weekly_total_count);
  const weeklyUsedPercent =
    weeklyRemaining !== undefined
      ? 100 - weeklyRemaining
      : weeklyUsed !== undefined && weeklyTotal !== undefined && weeklyTotal > 0
        ? (weeklyUsed / weeklyTotal) * 100
        : null;
  if (weeklyUsedPercent !== null) {
    windows.push({
      id: `m${index}-weekly`,
      title: prefix("Weekly"),
      usedPercent: Math.min(100, Math.max(0, weeklyUsedPercent)),
      resetsAtMs: epochToMs(model.weekly_end_time) ?? null,
      valueText: weeklyUsed !== undefined && weeklyTotal !== undefined ? `${weeklyUsed}/${weeklyTotal}` : undefined,
    });
  }
  void nowMs;
  return windows;
}

function findModelRemains(data: unknown): Record<string, unknown>[] {
  const root = asRecord(data);
  if (!root) return [];
  for (const key of ["model_remains", "modelRemains"]) {
    const direct = root[key];
    if (Array.isArray(direct)) return direct.map(asRecord).filter((r): r is Record<string, unknown> => r !== null);
  }
  const nested = asRecord(root.data);
  if (nested) {
    for (const key of ["model_remains", "modelRemains"]) {
      const list = nested[key];
      if (Array.isArray(list)) return list.map(asRecord).filter((r): r is Record<string, unknown> => r !== null);
    }
  }
  return [];
}

export function parseMinimaxRemains(data: unknown, nowMs: number = Date.now()): MinimaxRemainsResult {
  const root = asRecord(data);
  if (!root) return { usage: null, apiError: null };

  const baseResp = asRecord(root.base_resp);
  if (baseResp) {
    const statusCode = asNum(baseResp.status_code);
    if (statusCode !== undefined && statusCode !== 0) {
      const msg = typeof baseResp.status_msg === "string" ? baseResp.status_msg : `status ${statusCode}`;
      return { usage: null, apiError: msg };
    }
  }

  const models = findModelRemains(root);
  const windows = models.flatMap((model, index) => modelWindows(model, index, nowMs));
  if (windows.length === 0) return { usage: null, apiError: null };
  return { usage: { windows }, apiError: null };
}
