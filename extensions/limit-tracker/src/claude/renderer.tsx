import { List } from "@vicinae/api";
import React from "react";

import type { Accessory, LimitView } from "../agents/types.ts";
import { LiveResetLabel } from "../agents/countdown.tsx";
import {
  formatErrorOrNoData,
  generateAsciiBar,
  generatePieIcon,
  getLoadingAccessory,
  getNoDataAccessory,
  renderErrorOrNoData,
} from "../agents/ui.tsx";
import type { ClaudeError, ClaudeUsage } from "./types.ts";

function formatWindow(name: string, percent: number, resetsIn: string | null): string {
  let text = `\n\n${name}: ${generateAsciiBar(percent)} ${percent}% remaining`;
  if (resetsIn) {
    text += `\nResets In: ${resetsIn}`;
  }
  return text;
}

function formatModelLabel(key: string): string {
  return `Weekly ${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export function formatClaudeUsageText(usage: ClaudeUsage | null, error: ClaudeError | null): string {
  const fallback = formatErrorOrNoData("Claude", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as ClaudeUsage;

  let text = `Claude Usage\nPlan: ${u.plan}`;
  text += formatWindow("5h Limit", u.fiveHour.percentageRemaining, u.fiveHour.resetsIn);

  if (u.sevenDay) {
    text += formatWindow("Weekly Limit", u.sevenDay.percentageRemaining, u.sevenDay.resetsIn);
  }

  for (const [model, window] of Object.entries(u.modelWindows || {})) {
    text += formatWindow(formatModelLabel(model), window.percentageRemaining, window.resetsIn);
  }

  if (u.extraUsage) {
    text += `\n\nExtra Usage: ${u.extraUsage.currency} ${u.extraUsage.used.toFixed(2)} / ${u.extraUsage.currency} ${u.extraUsage.limit.toFixed(2)}`;
  }

  return text;
}

export function renderClaudeDetail(usage: ClaudeUsage | null, error: ClaudeError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as ClaudeUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Plan" text={u.plan} />
      <List.Item.Detail.Metadata.Separator />

      <List.Item.Detail.Metadata.Label
        title="5h Limit"
        text={`${generateAsciiBar(u.fiveHour.percentageRemaining)} ${u.fiveHour.percentageRemaining}% remaining`}
      />
      {u.fiveHour.resetsIn && <LiveResetLabel seconds={u.fiveHour.resetsInSeconds} />}

      {u.sevenDay && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Weekly Limit"
            text={`${generateAsciiBar(u.sevenDay.percentageRemaining)} ${u.sevenDay.percentageRemaining}% remaining`}
          />
          {u.sevenDay.resetsIn && <LiveResetLabel seconds={u.sevenDay.resetsInSeconds} />}
        </>
      )}

      {Object.entries(u.modelWindows || {}).map(([model, window]) => (
        <React.Fragment key={model}>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title={formatModelLabel(model)}
            text={`${generateAsciiBar(window.percentageRemaining)} ${window.percentageRemaining}% remaining`}
          />
          {window.resetsIn && <LiveResetLabel seconds={window.resetsInSeconds} />}
        </React.Fragment>
      ))}

      {u.extraUsage && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Extra Usage"
            text={`${u.extraUsage.currency} ${u.extraUsage.used.toFixed(2)} / ${u.extraUsage.currency} ${u.extraUsage.limit.toFixed(2)}`}
          />
        </>
      )}
    </List.Item.Detail.Metadata>
  );
}

/**
 * Resolve which limit window to display based on user preference.
 * - "auto": show 5h if available (paid plan), otherwise weekly (free plan)
 * - "5h": always show 5h if available, fallback to weekly
 * - "weekly": always show weekly if available, fallback to 5h
 */
function resolveClaudeLimit(
  usage: ClaudeUsage,
  limitView: LimitView,
): { percent: number; label: string; resetsIn: string | null } {
  const hasFiveHour = usage.fiveHour?.percentageRemaining != null;
  const hasWeekly = usage.sevenDay?.percentageRemaining != null;

  if (limitView === "weekly" && hasWeekly) {
    return {
      percent: usage.sevenDay!.percentageRemaining,
      label: "Weekly",
      resetsIn: usage.sevenDay!.resetsIn,
    };
  }

  if (limitView === "5h" && hasFiveHour) {
    return {
      percent: usage.fiveHour.percentageRemaining,
      label: "5h",
      resetsIn: usage.fiveHour.resetsIn,
    };
  }

  // Auto: prefer 5h (paid plan indicator), fallback to weekly (free plan)
  if (hasFiveHour) {
    return {
      percent: usage.fiveHour.percentageRemaining,
      label: "5h",
      resetsIn: usage.fiveHour.resetsIn,
    };
  }

  if (hasWeekly) {
    return {
      percent: usage.sevenDay!.percentageRemaining,
      label: "Weekly",
      resetsIn: usage.sevenDay!.resetsIn,
    };
  }

  // Fallback: no data
  return { percent: 0, label: "N/A", resetsIn: null };
}

export function getClaudeAccessory(
  usage: ClaudeUsage | null,
  error: ClaudeError | null,
  isLoading: boolean,
  limitView: LimitView = "auto",
): Accessory {
  if (isLoading) {
    return getLoadingAccessory("Claude");
  }

  if (error) {
    if (error.type === "not_configured") {
      return { text: "Not Configured", tooltip: error.message };
    }
    if (error.type === "missing_scope") {
      return { text: "Missing Scope", tooltip: error.message };
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

  const resolved = resolveClaudeLimit(usage, limitView);
  const tooltipParts = [];
  if (usage.fiveHour?.percentageRemaining != null) {
    tooltipParts.push(`5h Limit: ${usage.fiveHour.percentageRemaining}%`);
  }
  if (usage.sevenDay?.percentageRemaining != null) {
    tooltipParts.push(`Weekly Limit: ${usage.sevenDay.percentageRemaining}%`);
  }
  for (const [model, window] of Object.entries(usage.modelWindows || {})) {
    tooltipParts.push(`${formatModelLabel(model)}: ${window.percentageRemaining}%`);
  }
  if (usage.extraUsage) {
    tooltipParts.push(
      `Extra: ${usage.extraUsage.currency} ${usage.extraUsage.used.toFixed(2)} / ${usage.extraUsage.limit.toFixed(2)}`,
    );
  }

  return {
    icon: generatePieIcon(resolved.percent),
    text: `${resolved.percent}%`,
    tooltip: tooltipParts.join("\n") || "Claude",
  };
}
