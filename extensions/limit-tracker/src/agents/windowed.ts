import type { LimitItem } from "./detail-format.ts";

/**
 * Shared normalized model for providers that report usage as a list of
 * windows (5-hour, weekly, monthly, per-model pools). Lets each provider
 * implement only auth + parsing while rendering stays uniform through
 * `LimitItems` (see limits.tsx).
 */

export type ProviderErrorType =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "network_error"
  | "parse_error"
  | "unknown";

export interface ProviderError {
  type: ProviderErrorType;
  message: string;
}

export interface UsageWindow {
  /** Stable key for React lists. */
  id: string;
  /** Row title, e.g. "5-Hour Limit" or "MiniMax-M2 — Weekly". */
  title: string;
  /** Percent used 0..100; null when the API publishes no percent — never collapse to 0. */
  usedPercent: number | null;
  /** Absolute reset time (epoch ms) for the live countdown. */
  resetsAtMs?: number | null;
  /** Static reset text when no timestamp exists (e.g. "resets daily"). */
  resetsText?: string | null;
  /** Absolute values appended after the percent, e.g. "214/2048". */
  valueText?: string;
  /** Trailing status note, e.g. "exhausted". */
  note?: string;
  /** Indented sub-rows rendered under this window. */
  subRows?: { title: string; text: string }[];
}

export interface WindowedUsage {
  plan?: string | null;
  /** Account context shown under Plan (email, org name, login method). */
  identity?: string | null;
  windows: UsageWindow[];
  /** Non-window rows (credit balances, extra usage). */
  extras?: { title: string; text: string }[];
}

export function windowToLimitItem(win: UsageWindow, nowMs: number): LimitItem {
  const percentRemaining =
    win.usedPercent === null ? null : Math.min(100, Math.max(0, 100 - win.usedPercent));
  const resetsInSeconds =
    win.resetsAtMs != null && Number.isFinite(win.resetsAtMs)
      ? Math.max(0, Math.round((win.resetsAtMs - nowMs) / 1000))
      : null;
  return {
    id: win.id,
    title: win.title,
    percentRemaining,
    valueText: win.valueText,
    resetsInSeconds,
    resetsText: resetsInSeconds === null ? (win.resetsText ?? null) : null,
    note: win.note,
    subRows: win.subRows,
  };
}

export function toLimitItems(usage: WindowedUsage, nowMs: number = Date.now()): LimitItem[] {
  return usage.windows.map((win) => windowToLimitItem(win, nowMs));
}

/** Percent remaining on the first window that publishes one — drives the list accessory. */
export function primaryRemaining(usage: WindowedUsage): number | null {
  for (const win of usage.windows) {
    if (win.usedPercent !== null) return Math.min(100, Math.max(0, 100 - win.usedPercent));
  }
  return null;
}
