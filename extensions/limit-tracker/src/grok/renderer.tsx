import type { Accessory } from "../agents/types.ts";
import { formatWindowedUsageText, getWindowedAccessory, renderWindowedDetail } from "../agents/windowed.tsx";
import type { GrokError, GrokUsage } from "./types.ts";

export function formatGrokUsageText(usage: GrokUsage | null, error: GrokError | null): string {
  return formatWindowedUsageText("Grok", usage, error);
}

export function renderGrokDetail(usage: GrokUsage | null, error: GrokError | null): React.ReactNode {
  return renderWindowedDetail(usage, error);
}

export function getGrokAccessory(usage: GrokUsage | null, error: GrokError | null, isLoading: boolean): Accessory {
  return getWindowedAccessory("Grok", usage, error, isLoading);
}
