import { List } from "@vicinae/api";

import { formatDuration, formatResetTime, parseDate } from "../agents/format.ts";
import { formatLimitsText } from "../agents/detail-format.ts";
import type { LimitItem } from "../agents/detail-format.ts";
import { LimitItems } from "../agents/limits.tsx";
import type { Accessory, LimitView } from "../agents/types.ts";
import {
  renderErrorOrNoData,
  formatErrorOrNoData,
  getLoadingAccessory,
  getNoDataAccessory,
  generatePieIcon,
} from "../agents/ui.tsx";
import { effectiveRemainingPercent } from "./effective-remaining.ts";
import type { CodexUsage, CodexError } from "./types.ts";

function codexLimitItems(u: CodexUsage): LimitItem[] {
  const items: LimitItem[] = [];

  if (u.fiveHourLimit) {
    items.push({
      id: "5h",
      title: "5h Limit",
      percentRemaining: u.fiveHourLimit.percentageRemaining,
      resetsInSeconds: u.fiveHourLimit.resetsInSeconds,
    });
  }
  if (u.weeklyLimit) {
    items.push({
      id: "weekly",
      title: "Weekly Limit",
      percentRemaining: u.weeklyLimit.percentageRemaining,
      resetsInSeconds: u.weeklyLimit.resetsInSeconds,
    });
  }
  if (u.codeReviewLimit) {
    items.push({
      id: "code-review",
      title: "Code Review Limit",
      percentRemaining: u.codeReviewLimit.percentageRemaining,
      resetsInSeconds: u.codeReviewLimit.resetsInSeconds,
    });
  }
  for (const additionalLimit of u.additionalRateLimits ?? []) {
    for (const [index, window] of additionalLimit.windows.entries()) {
      items.push({
        id: `${additionalLimit.meteredFeature ?? additionalLimit.name}-${window.limitWindowSeconds}-${index}`,
        title: additionalLimitTitle(additionalLimit.name, window.limitWindowSeconds, additionalLimit.windows.length),
        percentRemaining: window.percentageRemaining,
        resetsInSeconds: window.resetsInSeconds,
      });
    }
  }

  return items;
}

export function formatCodexUsageText(usage: CodexUsage | null, error: CodexError | null): string {
  const fallback = formatErrorOrNoData("Codex", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CodexUsage;

  let text = `Codex Usage\nAccount: ${u.account}`;
  if (u.viaOmp) {
    text += `\nSource: via omp`;
  }
  text += formatLimitsText(codexLimitItems(u));

  text += `\n\nCredits: ${u.credits.unlimited ? "Unlimited" : u.credits.balance}`;

  if (u.resetCredits) {
    text += `\nLimit Reset Credits: ${formatResetCredits(u.resetCredits.availableCount)}`;
    if (u.resetCredits.expiresAtList.length > 0) {
      text += "\nExpires At:";
      for (const expiresAt of u.resetCredits.expiresAtList) {
        text += `\n- ${formatExpireTime(expiresAt)}`;
      }
    }
    if (u.resetCreditsError) {
      text += `\nReset Credits Error: ${u.resetCreditsError}`;
    }
  }

  return text;
}

export function renderCodexDetail(usage: CodexUsage | null, error: CodexError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CodexUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Account" text={u.account} />
      {u.viaOmp && (
        <List.Item.Detail.Metadata.Label title="Source" text="via omp" />
      )}

      <LimitItems items={codexLimitItems(u)} />

      <List.Item.Detail.Metadata.Separator />

      <List.Item.Detail.Metadata.Label title="Credits" text={u.credits.unlimited ? "Unlimited" : u.credits.balance} />

      {u.resetCredits && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Limit Reset Credits"
            text={formatResetCredits(u.resetCredits.availableCount)}
          />
          {u.resetCredits.expiresAtList.map((expiresAt, index) => (
            <List.Item.Detail.Metadata.Label
              key={`${expiresAt}-${index}`}
              title={`Manual Reset ${index + 1} Expires`}
              text={formatExpireTime(expiresAt)}
            />
          ))}
          {u.resetCreditsError && (
            <List.Item.Detail.Metadata.Label title="Reset Credits Error" text={u.resetCreditsError} />
          )}
        </>
      )}
    </List.Item.Detail.Metadata>
  );
}

function formatResetCredits(availableCount: number | null): string {
  return availableCount === null
    ? "Unavailable"
    : `${availableCount} manual reset${availableCount === 1 ? "" : "s"} available`;
}

function formatExpireTime(value: string): string {
  const date = parseDate(value);
  if (!date) return "unknown";

  const absoluteTime = date
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(",", "");
  return `${absoluteTime} (${formatResetTime(value)})`;
}

/**
 * Resolve which limit window to display based on user preference.
 */
function resolveCodexLimit(
  usage: CodexUsage,
  limitView: LimitView,
): { percent: number; label: string } {
  const hasFiveHour = usage.fiveHourLimit != null;
  const hasWeekly = usage.weeklyLimit != null;

  if (limitView === "weekly" && hasWeekly) {
    return { percent: usage.weeklyLimit!.percentageRemaining, label: "Weekly" };
  }

  if (limitView === "5h" && hasFiveHour) {
    return { percent: usage.fiveHourLimit!.percentageRemaining, label: "5h" };
  }

  // Auto: prefer 5h (paid plan), fallback to weekly (free plan)
  if (hasFiveHour) {
    return { percent: usage.fiveHourLimit!.percentageRemaining, label: "5h" };
  }

  if (hasWeekly) {
    return { percent: usage.weeklyLimit!.percentageRemaining, label: "Weekly" };
  }

  // Fallback to effectiveRemainingPercent (worst of all windows)
  return { percent: effectiveRemainingPercent(usage), label: "Best" };
}

export function getCodexAccessory(usage: CodexUsage | null, error: CodexError | null, isLoading: boolean, limitView: LimitView = "auto"): Accessory {
  if (isLoading) {
    return getLoadingAccessory("Codex");
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

  // Surface the binding constraint based on user preference.
  // Free tier accounts only have weekly limits, so we respect that.
  const resolved = resolveCodexLimit(usage, limitView);
  const remaining = resolved.percent;
  const parts = [];
  if (usage.fiveHourLimit) parts.push(`5h: ${usage.fiveHourLimit.percentageRemaining}%`);
  if (usage.weeklyLimit) parts.push(`Weekly: ${usage.weeklyLimit.percentageRemaining}%`);
  if (usage.codeReviewLimit) parts.push(`Code Review: ${usage.codeReviewLimit.percentageRemaining}%`);
  for (const additionalLimit of usage.additionalRateLimits ?? []) {
    const remaining = Math.min(...additionalLimit.windows.map((window) => window.percentageRemaining));
    parts.push(`${additionalLimit.name}: ${remaining}%`);
  }

  const tooltip = parts.join(" | ") || "Codex";

  return {
    icon: generatePieIcon(remaining),
    text: `${remaining}%`,
    tooltip: usage?.viaOmp ? `${tooltip}\nvia omp` : tooltip,
  };
}

function additionalLimitTitle(name: string, limitWindowSeconds: number, windowCount: number): string {
  if (limitWindowSeconds === 5 * 60 * 60) return `${name} — 5h Limit`;
  if (limitWindowSeconds === 7 * 24 * 60 * 60) return `${name} — Weekly Limit`;
  if (limitWindowSeconds >= 28 * 24 * 60 * 60 && limitWindowSeconds <= 31 * 24 * 60 * 60) {
    return `${name} — Monthly Limit`;
  }
  if (windowCount === 1) return name;
  return `${name} — ${formatDuration(limitWindowSeconds)} window`;
}
