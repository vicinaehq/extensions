import { List } from "@vicinae/api";

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
import type { GeminiUsage, GeminiError } from "./types.ts";

function geminiLimitItems(u: GeminiUsage): LimitItem[] {
  return [
    u.proModel
      ? {
          id: "pro",
          title: `Pro (${u.proModel.modelId})`,
          percentRemaining: u.proModel.percentLeft,
          resetsText: u.proModel.resetsIn,
        }
      : { id: "pro", title: "Pro Model", percentRemaining: null, valueText: "No quota data" },
    u.flashModel
      ? {
          id: "flash",
          title: `Flash (${u.flashModel.modelId})`,
          percentRemaining: u.flashModel.percentLeft,
          resetsText: u.flashModel.resetsIn,
        }
      : { id: "flash", title: "Flash Model", percentRemaining: null, valueText: "No quota data" },
  ];
}

export function formatGeminiUsageText(usage: GeminiUsage | null, error: GeminiError | null): string {
  const fallback = formatErrorOrNoData("Gemini", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as GeminiUsage;

  return `Gemini Usage` + formatLimitsText(geminiLimitItems(u));
}

export function renderGeminiDetail(usage: GeminiUsage | null, error: GeminiError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as GeminiUsage;

  return (
    <List.Item.Detail.Metadata>
      <LimitItems items={geminiLimitItems(u)} />
    </List.Item.Detail.Metadata>
  );
}

export function getGeminiAccessory(
  usage: GeminiUsage | null,
  error: GeminiError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) {
    return getLoadingAccessory("Gemini");
  }

  if (error) {
    if (error.type === "not_configured") {
      return { text: "Not Configured", tooltip: error.message };
    }
    if (error.type === "unsupported_auth") {
      return { text: "Unsupported Auth", tooltip: error.message };
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

  if (usage.proModel) {
    const proPercent = usage.proModel.percentLeft;
    const flashPercent = usage.flashModel?.percentLeft ?? "—";
    return {
      icon: generatePieIcon(proPercent),
      text: `${proPercent}%`,
      tooltip: `Pro: ${proPercent}% | Flash: ${flashPercent}%`,
    };
  }

  if (usage.flashModel) {
    return {
      icon: generatePieIcon(usage.flashModel.percentLeft),
      text: `${usage.flashModel.percentLeft}%`,
      tooltip: `Flash: ${usage.flashModel.percentLeft}%`,
    };
  }

  return { text: "—", tooltip: "No quota data available" };
}
