import type { Accessory } from "../agents/types.ts";
import { formatWindowedUsageText, getWindowedAccessory, renderWindowedDetail } from "../agents/windowed.tsx";
import type { AmpError, AmpUsage } from "./types.ts";

export function formatAmpUsageText(usage: AmpUsage | null, error: AmpError | null): string {
  return formatWindowedUsageText("Amp", usage, error);
}

export function renderAmpDetail(usage: AmpUsage | null, error: AmpError | null): React.ReactNode {
  return renderWindowedDetail(usage, error);
}

export function getAmpAccessory(usage: AmpUsage | null, error: AmpError | null, isLoading: boolean): Accessory {
  return getWindowedAccessory("Amp", usage, error, isLoading);
}
