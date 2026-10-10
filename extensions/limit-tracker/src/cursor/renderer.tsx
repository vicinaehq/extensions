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
import { formatCursorAccessory } from "./accessory.ts";
import type { CursorError, CursorRateWindow, CursorUsage } from "./types.ts";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

function formatReset(value: string | null): string {
  return value ? formatResetTime(value) : "unknown";
}

function cursorWindowItem(id: string, label: string, window: CursorRateWindow): LimitItem {
  return {
    id,
    title: label,
    percentRemaining: window.percentageRemaining,
    resetsText: formatReset(window.resetsAt),
  };
}

function cursorLimitItems(u: CursorUsage): LimitItem[] {
  const total = cursorWindowItem("total", u.legacyRequests ? "Requests" : "Total", u.total);
  if (u.legacyRequests) {
    total.subRows = [{ title: "Request Usage", text: `${u.legacyRequests.used} / ${u.legacyRequests.limit} requests` }];
  }
  const items = [total];
  if (u.auto) items.push(cursorWindowItem("auto", "Auto", u.auto));
  if (u.api) items.push(cursorWindowItem("api", "API", u.api));
  return items;
}

export function formatCursorUsageText(usage: CursorUsage | null, error: CursorError | null): string {
  const fallback = formatErrorOrNoData("Cursor", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CursorUsage;

  let text = `Cursor Usage\nAccount: ${u.account}\nSource: ${u.source}`;
  if (u.membershipType) {
    text += `\nPlan: ${u.membershipType}`;
  }

  text += formatLimitsText(cursorLimitItems(u));

  if (u.planLimitUsd > 0 || u.planUsedUsd > 0) {
    text += `\n\nIncluded Usage: ${formatUsd(u.planUsedUsd)} / ${formatUsd(u.planLimitUsd)}`;
  }
  if (u.onDemand) {
    text += `\nOn-demand: ${formatUsd(u.onDemand.usedUsd)}`;
    if (u.onDemand.limitUsd !== null) {
      text += ` / ${formatUsd(u.onDemand.limitUsd)}`;
    }
    if (u.onDemand.personalUsedUsd !== null) {
      text += `\nPersonal on-demand: ${formatUsd(u.onDemand.personalUsedUsd)}`;
    }
  }

  return text;
}

export function renderCursorDetail(usage: CursorUsage | null, error: CursorError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CursorUsage;

  return (
    <List.Item.Detail.Metadata>
      {u.membershipType && (
        <List.Item.Detail.Metadata.Label title="Plan" text={u.membershipType} />
      )}

      <LimitItems items={cursorLimitItems(u)} />

      {(u.planLimitUsd > 0 || u.planUsedUsd > 0 || u.onDemand) && <List.Item.Detail.Metadata.Separator />}
      {(u.planLimitUsd > 0 || u.planUsedUsd > 0) && (
        <List.Item.Detail.Metadata.Label
          title="Included Usage"
          text={`${formatUsd(u.planUsedUsd)} / ${formatUsd(u.planLimitUsd)}`}
        />
      )}
      {u.onDemand && (
        <>
          <List.Item.Detail.Metadata.Label
            title="On-demand"
            text={
              u.onDemand.limitUsd === null
                ? formatUsd(u.onDemand.usedUsd)
                : `${formatUsd(u.onDemand.usedUsd)} / ${formatUsd(u.onDemand.limitUsd)}`
            }
          />
          {u.onDemand.personalUsedUsd !== null && (
            <List.Item.Detail.Metadata.Label title="Personal On-demand" text={formatUsd(u.onDemand.personalUsedUsd)} />
          )}
        </>
      )}
    </List.Item.Detail.Metadata>
  );
}

export function getCursorAccessory(
  usage: CursorUsage | null,
  error: CursorError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) {
    return getLoadingAccessory("Cursor");
  }

  if (error) {
    if (error.type === "not_configured") {
      return { text: "Not Configured", tooltip: error.message };
    }
    if (error.type === "unauthorized") {
      return { text: "Session Expired", tooltip: error.message };
    }
    if (error.type === "network_error") {
      return { text: "Network Error", tooltip: error.message };
    }
    return { text: "Error", tooltip: error.message };
  }

  if (!usage) {
    return getNoDataAccessory();
  }

  const badge = formatCursorAccessory(usage);
  return {
    icon: generatePieIcon(badge.remainingForIcon),
    text: badge.text,
    tooltip: badge.tooltip,
  };
}
