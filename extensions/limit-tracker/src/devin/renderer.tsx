import { List } from "@vicinae/api";

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
import type { DevinAcuLimit, DevinError, DevinUsage } from "./types.ts";

function formatAcus(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ACUs`;
}

function scopeLabel(limit: DevinAcuLimit): string {
  if (limit.scope === "enterprise") return "Enterprise";
  const id = limit.scope === "org" ? limit.orgId : limit.userId;
  const suffix = id ? ` ${id}` : "";
  return limit.scope === "org" ? `Org${suffix}` : `User${suffix}`;
}

function secondsUntil(ms: number | null): number | null {
  if (ms === null) return null;
  const seconds = Math.round((ms - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

function devinLimitItems(u: DevinUsage): LimitItem[] {
  const items: LimitItem[] = [];

  if (u.web) {
    if (u.web.dailyUsedPct !== null) {
      items.push({
        id: "daily",
        title: "Daily Quota",
        percentRemaining: Math.min(100, Math.max(0, 100 - u.web.dailyUsedPct)),
        resetsInSeconds: secondsUntil(u.web.dailyResetMs),
      });
    }
    if (u.web.weeklyUsedPct !== null) {
      items.push({
        id: "weekly",
        title: "Weekly Quota",
        percentRemaining: Math.min(100, Math.max(0, 100 - u.web.weeklyUsedPct)),
        resetsInSeconds: secondsUntil(u.web.weeklyResetMs),
      });
    }
  }

  const ordered = [...u.limits].sort((a, b) => (a.scope === "enterprise" ? -1 : b.scope === "enterprise" ? 1 : 0));
  for (const [index, limit] of ordered.entries()) {
    const title = `ACU Limit — ${scopeLabel(limit)}`;
    if (limit.scope !== "enterprise") {
      // Consumption data is enterprise-wide; per-org/user usage isn't exposed,
      // so narrower caps render as text rather than a fake percentage.
      items.push({ id: `limit-${index}`, title, percentRemaining: null, valueText: `${formatAcus(limit.cycleAcuLimit)}/cycle` });
      continue;
    }
    const remaining = Math.max(0, limit.cycleAcuLimit - u.devinAcus);
    const percent = limit.cycleAcuLimit > 0 ? Math.min(100, Math.max(0, (remaining / limit.cycleAcuLimit) * 100)) : 0;
    items.push({
      id: `limit-${index}`,
      title,
      percentRemaining: percent,
      valueText: `${formatAcus(u.devinAcus)}/${formatAcus(limit.cycleAcuLimit)}`,
      resetsInSeconds: Math.max(0, Math.round((u.cycleEndMs - Date.now()) / 1000)),
    });
  }
  return items;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function productBreakdown(u: DevinUsage): string {
  const parts = [`Devin ${formatAcus(u.byProduct.devin)}`];
  if (u.byProduct.cascade > 0) parts.push(`Cascade ${formatAcus(u.byProduct.cascade)}`);
  if (u.byProduct.terminal > 0) parts.push(`Terminal ${formatAcus(u.byProduct.terminal)}`);
  if (u.byProduct.review > 0) parts.push(`Review ${formatAcus(u.byProduct.review)}`);
  return parts.join(" · ");
}

function planLabel(u: DevinUsage): string {
  return u.web?.plan ?? (u.limits.length > 0 ? "Enterprise" : "Devin");
}

export function formatDevinUsageText(usage: DevinUsage | null, error: DevinError | null): string {
  const fallback = formatErrorOrNoData("Devin", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as DevinUsage;

  let text = `Devin Usage\nPlan: ${planLabel(u)}`;
  if (u.cycleStartMs > 0) text += `\nCycle: ${formatDate(u.cycleStartMs)} – ${formatDate(u.cycleEndMs)}`;
  text += formatLimitsText(devinLimitItems(u));
  if (u.limits.length > 0) {
    text += `\n\nCycle Consumption: ${formatAcus(u.totalAcus)} (${productBreakdown(u)})`;
  }
  if (u.web?.overageBalanceUsd != null) {
    text += `\n\nExtra Usage Balance: $${u.web.overageBalanceUsd.toFixed(2)}`;
  }
  return text;
}

export function renderDevinDetail(usage: DevinUsage | null, error: DevinError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as DevinUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Plan" text={planLabel(u)} />
      {u.cycleStartMs > 0 ? (
        <List.Item.Detail.Metadata.Label
          title="Cycle"
          text={`${formatDate(u.cycleStartMs)} – ${formatDate(u.cycleEndMs)}`}
        />
      ) : null}

      <LimitItems items={devinLimitItems(u)} />

      {u.limits.length > 0 ? (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Cycle Consumption" text={formatAcus(u.totalAcus)} />
          <List.Item.Detail.Metadata.Label title="By Product" text={productBreakdown(u)} />
        </>
      ) : null}
      {u.web?.overageBalanceUsd != null ? (
        <List.Item.Detail.Metadata.Label
          title="Extra Usage Balance"
          text={`$${u.web.overageBalanceUsd.toFixed(2)}`}
        />
      ) : null}
    </List.Item.Detail.Metadata>
  );
}

export function getDevinAccessory(usage: DevinUsage | null, error: DevinError | null, isLoading: boolean): Accessory {
  if (isLoading) return getLoadingAccessory("Devin");

  if (error) {
    if (error.type === "not_configured") return { text: "Not Configured", tooltip: error.message };
    if (error.type === "unauthorized") return { text: "Key Expired", tooltip: error.message };
    if (error.type === "forbidden") return { text: "Enterprise Only", tooltip: error.message };
    if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
    return { text: "Error", tooltip: error.message };
  }

  if (!usage) return getNoDataAccessory();

  // Self-serve path: weekly (or daily) remaining percent drives the accessory.
  const web = usage.web;
  if (web) {
    const weeklyRemaining = web.weeklyUsedPct !== null ? Math.min(100, Math.max(0, 100 - web.weeklyUsedPct)) : null;
    const dailyRemaining = web.dailyUsedPct !== null ? Math.min(100, Math.max(0, 100 - web.dailyUsedPct)) : null;
    const primary = weeklyRemaining ?? dailyRemaining;
    const tooltip = [
      web.plan ? `Plan: ${web.plan}` : null,
      dailyRemaining !== null ? `Daily: ${dailyRemaining.toFixed(1)}% remaining` : null,
      weeklyRemaining !== null ? `Weekly: ${weeklyRemaining.toFixed(1)}% remaining` : null,
      usage.limits.length > 0 ? `This cycle: ${formatAcus(usage.totalAcus)}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    if (primary !== null) {
      return { icon: generatePieIcon(Math.round(primary)), text: `${Math.round(primary)}%`, tooltip };
    }
    return { text: web.plan ?? "Devin", tooltip };
  }

  const enterprise = usage.limits.find((limit) => limit.scope === "enterprise");
  const tooltip = [
    ...usage.limits.map((limit) => `${scopeLabel(limit)}: ${formatAcus(limit.cycleAcuLimit)}/cycle`),
    `This cycle: ${formatAcus(usage.totalAcus)}`,
  ].join(" | ");

  if (enterprise && enterprise.cycleAcuLimit > 0) {
    const remaining = Math.max(0, enterprise.cycleAcuLimit - usage.devinAcus);
    const percent = Math.min(100, Math.max(0, Math.round((remaining / enterprise.cycleAcuLimit) * 100)));
    return { icon: generatePieIcon(percent), text: `${percent}%`, tooltip };
  }
  return { text: formatAcus(usage.totalAcus), tooltip };
}
