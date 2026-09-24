import { List } from "@vicinae/api";

import { formatResetTime, getRemainingPercent } from "../agents/format.ts";
import { formatLimitsText } from "../agents/detail-format.ts";
import type { LimitItem } from "../agents/detail-format.ts";
import { LimitItems } from "../agents/limits.tsx";
import type { Accessory } from "../agents/types.ts";
import {
  renderErrorOrNoData,
  formatErrorOrNoData,
  getLoadingAccessory,
  getNoDataAccessory,
  generatePieIcon,
} from "../agents/ui.tsx";
import type { ZaiUsage, ZaiError, ZaiLimitEntry } from "./types.ts";

function getRemainingNumericPercent(entry: ZaiLimitEntry | undefined | null): number | undefined {
  if (!entry) return undefined;
  // API percentage field is "percentage used", so remaining = 100 - percentage
  if (entry.percentage != null) {
    return 100 - entry.percentage;
  }
  // Fallback: calculate from remaining/usage if available
  if (entry.remaining != null && entry.usage != null) {
    const total = entry.remaining + entry.usage;
    if (total > 0) {
      return Math.round(getRemainingPercent(entry.remaining, total));
    }
    // If total is 0 but remaining is also 0, we're at 100% (full quota, no usage)
    if (entry.remaining === 0 && entry.usage === 0) {
      return 100;
    }
  }
  return undefined;
}

function formatRemainingText(entry: ZaiLimitEntry): string | undefined {
  if (entry.remaining != null && entry.usage != null) {
    return `${entry.remaining}/${entry.usage}`;
  }
  if (entry.currentValue != null) {
    return `${entry.currentValue}`;
  }
  return undefined;
}

function zaiLimitItem(id: string, label: string, entry: ZaiLimitEntry | null): LimitItem | null {
  if (!entry) return null;
  return {
    id,
    title: `${label} (${entry.windowDescription})`,
    percentRemaining: getRemainingNumericPercent(entry) ?? null,
    valueText: formatRemainingText(entry),
    resetsText: entry.resetTime ? formatResetTime(entry.resetTime) : null,
    subRows: entry.usageDetails.map((detail) => ({
      title: `  ${detail.modelCode}`,
      text: `${detail.usage}`,
    })),
  };
}

function zaiLimitItems(u: ZaiUsage): LimitItem[] {
  return [
    zaiLimitItem("token", "Token Limit", u.tokenLimit),
    zaiLimitItem("weekly-token", "Weekly Token Limit", u.weeklyTokenLimit),
    zaiLimitItem("time", "Time Limit", u.timeLimit),
    zaiLimitItem("weekly-time", "Weekly Time Limit", u.weeklyTimeLimit),
  ].filter((item): item is LimitItem => item !== null);
}

export function formatZaiUsageText(usage: ZaiUsage | null, error: ZaiError | null): string {
  const fallback = formatErrorOrNoData("z.ai", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as ZaiUsage;

  let text = "z.ai Usage";
  if (u.planName) {
    text += `\nPlan: ${u.planName}`;
  }
  text += formatLimitsText(zaiLimitItems(u));

  return text;
}

export function renderZaiDetail(usage: ZaiUsage | null, error: ZaiError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as ZaiUsage;

  return (
    <List.Item.Detail.Metadata>
      {u.planName && <List.Item.Detail.Metadata.Label title="Plan" text={u.planName} />}

      <LimitItems items={zaiLimitItems(u)} />
    </List.Item.Detail.Metadata>
  );
}

export function getZaiAccessory(usage: ZaiUsage | null, error: ZaiError | null, isLoading: boolean): Accessory {
  if (isLoading) {
    return getLoadingAccessory("z.ai");
  }

  if (error) {
    if (error.type === "not_configured") {
      return { text: "Not Configured", tooltip: error.message };
    }
    if (error.type === "unauthorized") {
      return { text: "Token Expired", tooltip: error.message };
    }
    if (error.type === "network_error") {
      return { text: "Network Error", tooltip: error.message };
    }
    return { text: "Error", tooltip: error.message };
  }

  if (!usage) {
    return getNoDataAccessory();
  }

  type AccessoryLimit = {
    label: string;
    entry: ZaiLimitEntry | null;
    group: "token" | "time";
  };

  const limits: Array<AccessoryLimit & { percent: number }> = [
    { label: "Tokens", entry: usage.tokenLimit, group: "token" },
    { label: "Weekly Tokens", entry: usage.weeklyTokenLimit, group: "token" },
    { label: "Time", entry: usage.timeLimit, group: "time" },
    { label: "Weekly Time", entry: usage.weeklyTimeLimit, group: "time" },
  ]
    .map((limit) => ({ ...limit, percent: getRemainingNumericPercent(limit.entry) }))
    .filter((limit): limit is AccessoryLimit & { percent: number } => limit.percent !== undefined);

  const parts = limits.map((limit) => `${limit.label}: ${limit.percent}%`);

  // Get bottleneck/minimum of all active percentages
  const activePercents = limits.map((limit) => limit.percent);
  const numericPercent = activePercents.length > 0 ? Math.min(...activePercents) : undefined;

  // The displayed text should also show the bottleneck of tokens (daily vs weekly)
  const tokenPercents = limits.filter((limit) => limit.group === "token").map((limit) => limit.percent);
  const minTokenPercent = tokenPercents.length > 0 ? Math.min(...tokenPercents) : undefined;
  const tokenText = minTokenPercent !== undefined ? `${minTokenPercent}%` : "—";

  return {
    icon: numericPercent !== undefined ? generatePieIcon(numericPercent) : undefined,
    text: tokenText,
    tooltip: parts.join(" | ") || "No limits available",
  };
}
