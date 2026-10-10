import { Icon, List } from "@vicinae/api";

import type { Accessory } from "../agents/types.ts";
import { formatErrorOrNoData, getLoadingAccessory, getNoDataAccessory, renderErrorOrNoData } from "../agents/ui.tsx";
import type { AihubmixError, AihubmixUsage } from "./types.ts";

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatAihubmixUsageText(usage: AihubmixUsage | null, error: AihubmixError | null): string {
  const fallback = formatErrorOrNoData("AiHubMix", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as AihubmixUsage;

  const lines = ["AiHubMix Usage"];
  if (u.balanceUsd !== null) lines.push(`Balance: ${formatUsd(u.balanceUsd)}`);
  if (u.quota !== null) lines.push(`Quota: ${u.quota.toLocaleString("en-US")}`);
  if (u.grantedUsd !== null) lines.push(`Granted: ${formatUsd(u.grantedUsd)}`);
  if (u.usedUsd !== null) lines.push(`Used: ${formatUsd(u.usedUsd)}`);
  return lines.join("\n");
}

export function renderAihubmixDetail(usage: AihubmixUsage | null, error: AihubmixError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as AihubmixUsage;

  return (
    <List.Item.Detail.Metadata>
      {u.balanceUsd !== null ? (
        <List.Item.Detail.Metadata.Label title="Balance" text={formatUsd(u.balanceUsd)} />
      ) : null}
      {u.quota !== null ? (
        <List.Item.Detail.Metadata.Label title="Quota" text={u.quota.toLocaleString("en-US")} />
      ) : null}
      {u.grantedUsd !== null ? (
        <List.Item.Detail.Metadata.Label title="Granted" text={formatUsd(u.grantedUsd)} />
      ) : null}
      {u.usedUsd !== null ? <List.Item.Detail.Metadata.Label title="Used" text={formatUsd(u.usedUsd)} /> : null}
    </List.Item.Detail.Metadata>
  );
}

export function getAihubmixAccessory(
  usage: AihubmixUsage | null,
  error: AihubmixError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) return getLoadingAccessory("AiHubMix");

  if (error) {
    if (error.type === "not_configured") return { text: "Not Configured", tooltip: error.message };
    if (error.type === "unauthorized") return { text: "Key Invalid", tooltip: error.message };
    if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
    if (error.type === "parse_error") return { text: "Parse Error", tooltip: error.message };
    return { text: "Error", tooltip: error.message };
  }

  if (!usage) return getNoDataAccessory();
  if (usage.balanceUsd !== null) {
    return { icon: Icon.Coins, text: formatUsd(usage.balanceUsd), tooltip: `AiHubMix balance: ${formatUsd(usage.balanceUsd)}` };
  }
  return getNoDataAccessory();
}
