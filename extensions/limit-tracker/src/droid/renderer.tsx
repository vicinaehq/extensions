import type { Accessory } from "../agents/types.ts";
import { formatWindowedUsageText, getWindowedAccessory, renderWindowedDetail } from "../agents/windowed.tsx";
import type { DroidError, DroidUsage } from "./types.ts";

export function formatDroidUsageText(usage: DroidUsage | null, error: DroidError | null): string {
  return formatWindowedUsageText("Droid", usage, error);
}

export function renderDroidDetail(usage: DroidUsage | null, error: DroidError | null): React.ReactNode {
  return renderWindowedDetail(usage, error);
}

export function getDroidAccessory(usage: DroidUsage | null, error: DroidError | null, isLoading: boolean): Accessory {
  return getWindowedAccessory("Droid", usage, error, isLoading);
}
