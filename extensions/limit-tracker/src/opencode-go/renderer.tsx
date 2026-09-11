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
import type { OpencodegoUsage, OpencodegoError, OpencodegoQuota } from "./types.ts";

function isValidQuota(q: OpencodegoQuota): boolean {
  return Number.isFinite(q.used) && Number.isFinite(q.limit) && q.limit > 0;
}

function quotaPercent(quota: OpencodegoQuota): number | null {
  if (!isValidQuota(quota)) return null;
  return Math.round(getRemainingPercent(quota.limit - quota.used, quota.limit));
}

/** Absolute "used/limit" text; null when the quota is a pure percentage. */
function quotaValueText(quota: OpencodegoQuota): string | undefined {
  if (!isValidQuota(quota)) {
    const u = Number.isFinite(quota.used) ? String(quota.used) : "—";
    const l = Number.isFinite(quota.limit) && quota.limit > 0 ? String(quota.limit) : "—";
    const unit = quota.unit ? ` ${quota.unit}` : "";
    return Number.isFinite(quota.limit) && quota.limit === 0 ? `No quota${unit}` : `${u}${unit}/${l}${unit} (—)`;
  }
  if (quota.unit === "%") return undefined;
  const unit = quota.unit ? ` ${quota.unit}` : "";
  return `${quota.used}${unit}/${quota.limit}${unit}`;
}

function resetsInSeconds(resetsAt: string | null | undefined): number | null {
  if (!resetsAt) return null;
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Math.floor((d.getTime() - Date.now()) / 1000);
  return diff > 0 ? diff : 0;
}

function quotaTitle(label: string): string {
  if (label === "5-Hour" || label === "5h") return "5h Limit";
  if (label === "Weekly") return "Weekly Limit";
  if (label === "Monthly") return "Monthly Limit";
  if (label.endsWith(" Limit")) return label;
  return `${label} Limit`;
}

function opencodegoLimitItems(u: OpencodegoUsage): LimitItem[] {
  const items: LimitItem[] = [
    {
      id: "primary",
      title: quotaTitle(u.primary.label),
      percentRemaining: quotaPercent(u.primary),
      valueText: quotaValueText(u.primary),
      resetsInSeconds: resetsInSeconds(u.primary.resetsAt),
      resetsText: resetsInSeconds(u.primary.resetsAt) === null && u.resetsAt ? formatResetTime(u.resetsAt) : null,
    },
  ];

  for (const [index, quota] of u.quotas.filter(isValidQuota).entries()) {
    items.push({
      id: `quota-${index}`,
      title: quotaTitle(quota.label),
      percentRemaining: quotaPercent(quota),
      valueText: quotaValueText(quota),
      resetsInSeconds: resetsInSeconds(quota.resetsAt),
    });
  }

  return items;
}

export function formatOpencodegoUsageText(usage: OpencodegoUsage | null, error: OpencodegoError | null): string {
  const fallback = formatErrorOrNoData("OpenCode Go", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as OpencodegoUsage;

  let text = `OpenCode Go Usage\nPlan: ${u.planName}`;
  if (u.viaOmp) {
    text += `\nSource: via omp`;
  }
  text += formatLimitsText(opencodegoLimitItems(u));

  return text;
}

export function renderOpencodegoDetail(usage: OpencodegoUsage | null, error: OpencodegoError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as OpencodegoUsage;

  const noQuotaData = u.quotas.filter(isValidQuota).length === 0 && !isValidQuota(u.primary);

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Plan" text={u.planName.replace(/ \(debug.*\)$/, "")} />
      {u.viaOmp && <List.Item.Detail.Metadata.Label title="Source" text="via omp" />}

      <LimitItems items={opencodegoLimitItems(u)} />

      {noQuotaData && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Usage" text="No quota data yet — check API key / workspace" />
        </>
      )}
    </List.Item.Detail.Metadata>
  );
}

export function getOpencodegoAccessory(
  usage: OpencodegoUsage | null,
  error: OpencodegoError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) return getLoadingAccessory("OpenCode Go");

  if (error) {
    if (error.type === "not_configured") return { text: "Not Configured", tooltip: error.message };
    if (error.type === "unauthorized") return { text: "Auth Expired", tooltip: error.message };
    if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
    return { text: "Error", tooltip: error.message };
  }

  if (!usage) return getNoDataAccessory();
  if (!isValidQuota(usage.primary)) return { text: "—", tooltip: "No quota data" };

  const remaining = usage.primary.limit - usage.primary.used;
  const percent = Math.round(getRemainingPercent(remaining, usage.primary.limit));

  // For percent quotas, tooltip shows used% to match website (0.6% used)
  const tooltipParts = usage.quotas.filter(isValidQuota).map((q) => {
    const r = q.limit - q.used;
    const pct = Math.round(getRemainingPercent(r, q.limit));
    return `${q.label}: ${pct}% remaining`;
  });
  const primaryTooltip = `${usage.primary.label}: ${percent}% remaining`;

  return {
    icon: generatePieIcon(percent),
    text: `${percent}%`,
    tooltip: usage?.viaOmp
      ? `${tooltipParts.length > 0 ? [primaryTooltip, ...tooltipParts].join(" | ") : primaryTooltip}\nvia omp`
      : tooltipParts.length > 0 ? [primaryTooltip, ...tooltipParts].join(" | ") : primaryTooltip,
  };
}
