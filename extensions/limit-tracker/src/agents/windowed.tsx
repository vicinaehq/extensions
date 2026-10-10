import { List } from "@vicinae/api";

import { formatLimitsText } from "./detail-format.ts";
import { LimitItems } from "./limits.tsx";
import type { Accessory } from "./types.ts";
import { formatErrorOrNoData, getLoadingAccessory, getNoDataAccessory, renderErrorOrNoData } from "./ui.tsx";
import { primaryRemaining, toLimitItems } from "./windowed.ts";
import type { ProviderError, WindowedUsage } from "./windowed.ts";

/** Standard accessory label for each error type — same wording everywhere. */
export function errorAccessory(error: ProviderError): Accessory {
  if (error.type === "not_configured") return { text: "Not Configured", tooltip: error.message };
  if (error.type === "unauthorized") return { text: "Key Invalid", tooltip: error.message };
  if (error.type === "forbidden") return { text: "No Access", tooltip: error.message };
  if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
  if (error.type === "parse_error") return { text: "Parse Error", tooltip: error.message };
  return { text: "Error", tooltip: error.message };
}

export function formatWindowedUsageText(
  name: string,
  usage: WindowedUsage | null,
  error: ProviderError | null,
): string {
  const fallback = formatErrorOrNoData(name, usage, error);
  if (fallback !== null) return fallback;
  const u = usage as WindowedUsage;

  let text = `${name} Usage`;
  if (u.plan) text += `\nPlan: ${u.plan}`;
  if (u.identity) text += `\nAccount: ${u.identity}`;
  text += formatLimitsText(toLimitItems(u));
  for (const extra of u.extras ?? []) {
    text += `\n\n${extra.title}: ${extra.text}`;
  }
  return text;
}

export function renderWindowedDetail(usage: WindowedUsage | null, error: ProviderError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as WindowedUsage;

  return (
    <List.Item.Detail.Metadata>
      {u.plan ? <List.Item.Detail.Metadata.Label title="Plan" text={u.plan} /> : null}
      {u.identity ? <List.Item.Detail.Metadata.Label title="Account" text={u.identity} /> : null}

      <LimitItems items={toLimitItems(u)} />

      {u.extras?.map((extra) => (
        <List.Item.Detail.Metadata.Label key={extra.title} title={extra.title} text={extra.text} />
      ))}
    </List.Item.Detail.Metadata>
  );
}

export function getWindowedAccessory(
  name: string,
  usage: WindowedUsage | null,
  error: ProviderError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) return getLoadingAccessory(name);
  if (error) return errorAccessory(error);
  if (!usage) return getNoDataAccessory();

  const remaining = primaryRemaining(usage);
  if (remaining !== null) {
    return {
      text: `${Math.round(remaining)}%`,
      tooltip: `${remaining.toFixed(1)}% remaining${usage.plan ? ` (${usage.plan})` : ""}`,
    };
  }
  if (usage.plan) return { text: usage.plan, tooltip: `Plan: ${usage.plan}` };
  return getNoDataAccessory();
}
