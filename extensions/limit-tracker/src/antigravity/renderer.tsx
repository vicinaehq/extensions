import { Icon, List } from "@vicinae/api";
import type React from "react";

import type { Accessory } from "../agents/types.ts";
import { formatErrorOrNoData, getLoadingAccessory, getNoDataAccessory, renderErrorOrNoData } from "../agents/ui.tsx";
import { LimitItems } from "../agents/limits.tsx";
import { formatLimitsText } from "../agents/detail-format.ts";
import type { LimitItem } from "../agents/detail-format.ts";
import type { AntigravityError, AntigravityPool, AntigravityUsage } from "./types.ts";

const VIA_OMP_NOTE = "Values via omp — may lag behind the live quota.";

/** "Usage (Google)" → "Google"; other labels pass through unchanged. */
function poolName(label: string): string {
  const match = /^Usage \((.+)\)$/.exec(label.trim());
  return match?.[1]?.trim() || label;
}

function poolTitle(pool: AntigravityPool): string {
  const name = poolName(pool.label);
  return pool.windowLabel ? `${name} — ${pool.windowLabel}` : name;
}

function resetsInSeconds(pool: AntigravityPool): number | null {
  if (pool.resetsAtMs === null) return null;
  const seconds = Math.round((pool.resetsAtMs - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

function poolToLimitItem(pool: AntigravityPool): LimitItem {
  return {
    id: pool.id,
    title: poolTitle(pool),
    percentRemaining: pool.percentRemaining,
    resetsInSeconds: resetsInSeconds(pool),
    note: pool.status && pool.status !== "ok" ? pool.status : undefined,
  };
}

function worstPool(pools: AntigravityPool[]): AntigravityPool {
  return pools.reduce((worst, pool) => (pool.percentRemaining < worst.percentRemaining ? pool : worst));
}

export function formatAntigravityUsageText(usage: AntigravityUsage | null, error: AntigravityError | null): string {
  const fallback = formatErrorOrNoData("Antigravity", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as AntigravityUsage;

  return `Antigravity Usage\nSource: ${VIA_OMP_NOTE}` + formatLimitsText(u.pools.map(poolToLimitItem));
}

export function renderAntigravityDetail(usage: AntigravityUsage | null, error: AntigravityError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as AntigravityUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Source" text="via omp" />
      <LimitItems items={u.pools.map(poolToLimitItem)} />
    </List.Item.Detail.Metadata>
  );
}

export function getAntigravityAccessory(
  usage: AntigravityUsage | null,
  error: AntigravityError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) return getLoadingAccessory("Antigravity");

  if (error) {
    if (error.type === "not_configured") return { text: "Not Configured", tooltip: error.message };
    if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
    if (error.type === "parse_error") return { text: "Parse Error", tooltip: error.message };
    return { text: "Error", tooltip: error.message };
  }

  if (!usage || usage.pools.length === 0) return getNoDataAccessory();

  const worst = worstPool(usage.pools);
  if (worst.status === "exhausted" || worst.percentRemaining <= 0) {
    return {
      icon: Icon.Warning,
      text: "Exhausted",
      tooltip: `${worst.label}: exhausted (${VIA_OMP_NOTE})`,
    };
  }
  return {
    text: `${worst.percentRemaining}%`,
    tooltip: usage.pools.map((pool) => `${poolTitle(pool)}: ${pool.percentRemaining}% remaining`).join("\n") + `\n${VIA_OMP_NOTE}`,
  };
}
