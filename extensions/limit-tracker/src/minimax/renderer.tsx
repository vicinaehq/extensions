import type { Accessory } from "../agents/types.ts";
import { formatWindowedUsageText, getWindowedAccessory, renderWindowedDetail } from "../agents/windowed.tsx";
import type { MinimaxError, MinimaxUsage } from "./types.ts";

export function formatMinimaxUsageText(
  name: string,
  usage: MinimaxUsage | null,
  error: MinimaxError | null,
): string {
  return formatWindowedUsageText(name, usage, error);
}

export function renderMinimaxDetail(usage: MinimaxUsage | null, error: MinimaxError | null): React.ReactNode {
  return renderWindowedDetail(usage, error);
}

export function getMinimaxAccessory(
  name: string,
  usage: MinimaxUsage | null,
  error: MinimaxError | null,
  isLoading: boolean,
): Accessory {
  return getWindowedAccessory(name, usage, error, isLoading);
}
