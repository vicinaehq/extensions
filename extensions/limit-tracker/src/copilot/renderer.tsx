import { List } from "@vicinae/api";

import { formatResetTime } from "../agents/format.ts";
import { formatLimitsText } from "../agents/detail-format.ts";
import type { LimitItem } from "../agents/detail-format.ts";
import { LimitItems } from "../agents/limits.tsx";
import type { Accessory } from "../agents/types.ts";
import {
  formatErrorOrNoData,
  generatePieIcon,
  getLoadingAccessory,
  getNoDataAccessory,
  renderErrorOrNoData,
} from "../agents/ui.tsx";
import type { CopilotError, CopilotUsage } from "./types.ts";

function formatPercent(value: number | null): string {
  return value === null ? "N/A" : `${value}%`;
}

function copilotLimitItems(u: CopilotUsage): LimitItem[] {
  return [
    {
      id: "premium",
      title: "Premium Interactions",
      percentRemaining: u.premiumRemaining,
      valueText: u.premiumRemaining === null ? "N/A remaining" : undefined,
    },
    {
      id: "chat",
      title: "Chat Quota",
      percentRemaining: u.chatRemaining,
      valueText: u.chatRemaining === null ? "N/A remaining" : undefined,
    },
  ];
}

export function formatCopilotUsageText(usage: CopilotUsage | null, error: CopilotError | null): string {
  const fallback = formatErrorOrNoData("Copilot", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CopilotUsage;

  let text = `Copilot Usage\nPlan: ${u.plan}`;
  text += formatLimitsText(copilotLimitItems(u));
  if (u.quotaResetDate) {
    text += `\n\nQuota Reset: ${formatResetTime(u.quotaResetDate)}`;
  }

  return text;
}

export function renderCopilotDetail(usage: CopilotUsage | null, error: CopilotError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CopilotUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Plan" text={u.plan} />
      <LimitItems items={copilotLimitItems(u)} />
      {u.quotaResetDate && (
        <List.Item.Detail.Metadata.Label title="Quota Reset" text={formatResetTime(u.quotaResetDate)} />
      )}
    </List.Item.Detail.Metadata>
  );
}

export function getCopilotAccessory(
  usage: CopilotUsage | null,
  error: CopilotError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) {
    return getLoadingAccessory("Copilot");
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

  const primaryPercent = usage.premiumRemaining ?? usage.chatRemaining;
  const text = primaryPercent !== null ? `${primaryPercent}%` : "—";
  const tooltip = `Premium: ${formatPercent(usage.premiumRemaining)} | Chat: ${formatPercent(usage.chatRemaining)}`;

  return {
    icon: primaryPercent !== null ? generatePieIcon(primaryPercent) : undefined,
    text,
    tooltip,
  };
}
