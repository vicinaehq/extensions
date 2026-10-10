import type { Accessory } from "../agents/types.ts";
import { formatWindowedUsageText, getWindowedAccessory, renderWindowedDetail } from "../agents/windowed.tsx";
import type { KimiError, KimiUsage } from "./types.ts";

export function formatKimiUsageText(usage: KimiUsage | null, error: KimiError | null): string {
  return formatWindowedUsageText("Kimi", usage, error);
}

export function renderKimiDetail(usage: KimiUsage | null, error: KimiError | null): React.ReactNode {
  return renderWindowedDetail(usage, error);
}

export function getKimiAccessory(usage: KimiUsage | null, error: KimiError | null, isLoading: boolean): Accessory {
  return getWindowedAccessory("Kimi", usage, error, isLoading);
}
