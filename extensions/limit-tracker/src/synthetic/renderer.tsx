import type { Accessory } from "../agents/types.ts";
import { formatWindowedUsageText, getWindowedAccessory, renderWindowedDetail } from "../agents/windowed.tsx";
import type { SyntheticError, SyntheticUsage } from "./types.ts";

export function formatSyntheticUsageText(usage: SyntheticUsage | null, error: SyntheticError | null): string {
  return formatWindowedUsageText("Synthetic", usage, error);
}

export function renderSyntheticDetail(usage: SyntheticUsage | null, error: SyntheticError | null): React.ReactNode {
  return renderWindowedDetail(usage, error);
}

export function getSyntheticAccessory(
  usage: SyntheticUsage | null,
  error: SyntheticError | null,
  isLoading: boolean,
): Accessory {
  return getWindowedAccessory("Synthetic", usage, error, isLoading);
}
