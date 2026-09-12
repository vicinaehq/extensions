import type { Accessory } from "../agents/types.ts";
import { formatWindowedUsageText, getWindowedAccessory, renderWindowedDetail } from "../agents/windowed.tsx";
import type { ClinepassError, ClinepassUsage } from "./types.ts";

export function formatClinepassUsageText(usage: ClinepassUsage | null, error: ClinepassError | null): string {
  return formatWindowedUsageText("ClinePass", usage, error);
}

export function renderClinepassDetail(usage: ClinepassUsage | null, error: ClinepassError | null): React.ReactNode {
  return renderWindowedDetail(usage, error);
}

export function getClinepassAccessory(
  usage: ClinepassUsage | null,
  error: ClinepassError | null,
  isLoading: boolean,
): Accessory {
  return getWindowedAccessory("ClinePass", usage, error, isLoading);
}
