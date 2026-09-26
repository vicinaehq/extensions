import type { SoftwareOperationProgress } from "../types.ts";

export function operationProgressMessage(
  progress: SoftwareOperationProgress,
): string {
  return progress.percent === undefined
    ? progress.message
    : `${progress.message} · ${progress.percent}%`;
}
