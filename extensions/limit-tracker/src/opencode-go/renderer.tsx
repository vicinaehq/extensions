import { List } from "@vicinae/api";

import { formatResetTime, getRemainingPercent } from "../agents/format.ts";
import { LiveResetLabel } from "../agents/countdown.tsx";
import type { Accessory } from "../agents/types.ts";
import {
  renderErrorOrNoData,
  formatErrorOrNoData,
  getLoadingAccessory,
  getNoDataAccessory,
  generatePieIcon,
  generateAsciiBar,
} from "../agents/ui.tsx";
import type { OpencodegoUsage, OpencodegoError, OpencodegoQuota } from "./types.ts";

function isValidQuota(q: OpencodegoQuota): boolean {
  return Number.isFinite(q.used) && Number.isFinite(q.limit) && q.limit > 0;
}

function formatQuotaText(quota: OpencodegoQuota): string {
  if (!isValidQuota(quota)) {
    const u = Number.isFinite(quota.used) ? String(quota.used) : "—";
    const l = Number.isFinite(quota.limit) && quota.limit > 0 ? String(quota.limit) : "—";
    const unit = quota.unit ? ` ${quota.unit}` : "";
    return Number.isFinite(quota.limit) && quota.limit === 0 ? `No quota${unit}` : `${u}${unit}/${l}${unit} (—)`;
  }
  const remaining = quota.limit - quota.used;
  const percent = Math.round(getRemainingPercent(remaining, quota.limit));
  if (quota.unit === "%") {
    return `${percent}% remaining`;
  }
  const usedStr = quota.unit ? `${quota.used} ${quota.unit}` : `${quota.used}`;
  const limitStr = quota.unit ? `${quota.limit} ${quota.unit}` : `${quota.limit}`;
  return `${usedStr}/${limitStr} (${percent}% remaining)`;
}

function resetsInSeconds(resetsAt: string | null | undefined): number | null {
  if (!resetsAt) return null;
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Math.floor((d.getTime() - Date.now()) / 1000);
  return diff > 0 ? diff : 0;
}

export function formatOpencodegoUsageText(usage: OpencodegoUsage | null, error: OpencodegoError | null): string {
  const fallback = formatErrorOrNoData("OpenCode Go", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as OpencodegoUsage;

  let text = `OpenCode Go Usage\nPlan: ${u.planName}`;

  const primaryRemaining = u.primary.limit - u.primary.used;
  const primaryPercent = Math.round(getRemainingPercent(primaryRemaining, u.primary.limit));
  text += `\n\n${u.primary.label}`;
  text += `\n${generateAsciiBar(primaryPercent)} ${formatQuotaText(u.primary)}`;

  for (const quota of u.quotas) {
    const remaining = quota.limit - quota.used;
    const percent = Math.round(getRemainingPercent(remaining, quota.limit));
    text += `\n\n${quota.label}`;
    text += `\n${generateAsciiBar(percent)} ${formatQuotaText(quota)}`;
  }

  if (u.resetsAt) {
    text += `\n\nResets: ${formatResetTime(u.resetsAt)}`;
  }

  return text;
}

function quotaTitle(label: string): string {
  if (label === "5-Hour" || label === "5h") return "5h Limit";
  if (label === "Weekly") return "Weekly Limit";
  if (label === "Monthly") return "Monthly Limit";
  if (label.endsWith(" Limit")) return label;
  return `${label} Limit`;
}

export function renderOpencodegoDetail(usage: OpencodegoUsage | null, error: OpencodegoError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as OpencodegoUsage;

  const elements: React.ReactNode[] = [];

  elements.push(<List.Item.Detail.Metadata.Label key="plan" title="Plan" text={u.planName.replace(/ \(debug.*\)$/, "")} />);
  elements.push(<List.Item.Detail.Metadata.Separator />);

  const primaryRemaining = Number.isFinite(u.primary.used) && Number.isFinite(u.primary.limit) ? u.primary.limit - u.primary.used : 0;
  const primaryPercent = Math.round(getRemainingPercent(primaryRemaining, u.primary.limit));
  elements.push(
    <List.Item.Detail.Metadata.Label
      key="primary"
      title={quotaTitle(u.primary.label)}
      text={`${generateAsciiBar(primaryPercent)} ${formatQuotaText(u.primary)}`}
    />,
  );
  const primarySec = resetsInSeconds(u.primary.resetsAt);
  if (primarySec !== null) elements.push(<LiveResetLabel key="primary-reset" seconds={primarySec} />);
  else if (u.resetsAt) elements.push(<List.Item.Detail.Metadata.Label key="primary-reset-fallback" title="Resets In" text={formatResetTime(u.resetsAt)} />);

  const visibleQuotas = u.quotas.filter(isValidQuota);
  if (visibleQuotas.length === 0 && !isValidQuota(u.primary)) {
    elements.push(<List.Item.Detail.Metadata.Separator key="sep-empty" />);
    elements.push(<List.Item.Detail.Metadata.Label key="empty" title="Usage" text="No quota data yet — check API key / workspace" />);
  }
  for (const [idx, quota] of visibleQuotas.entries()) {
    const remaining = quota.limit - quota.used;
    const percent = Math.round(getRemainingPercent(remaining, quota.limit));
    elements.push(<List.Item.Detail.Metadata.Separator key={`sep-${idx}`} />);
    elements.push(
      <List.Item.Detail.Metadata.Label
        key={`quota-${idx}`}
        title={quotaTitle(quota.label)}
        text={`${generateAsciiBar(percent)} ${formatQuotaText(quota)}`}
      />,
    );
    const sec = resetsInSeconds(quota.resetsAt);
    if (sec !== null) elements.push(<LiveResetLabel key={`quota-reset-${idx}`} seconds={sec} />);
  }

  return <List.Item.Detail.Metadata>{...elements}</List.Item.Detail.Metadata>;
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
    tooltip: tooltipParts.length > 0 ? [primaryTooltip, ...tooltipParts].join(" | ") : primaryTooltip,
  };
}
