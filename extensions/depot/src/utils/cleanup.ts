export interface CleanupTargetSummary {
  cleanableCount: number;
  hasAptCleanup: boolean;
}

/**
 * Counts reviewed cleanup targets. APT's unreadable partial-download cache is
 * informational only: it is never a target and never prompts for cleanup.
 */
export function summarizeCleanupTargets(
  aptPackages: number,
  aptArchives: number,
  flatpakRuntimes: number,
): CleanupTargetSummary {
  const aptTargets = aptPackages + aptArchives;
  return {
    cleanableCount: aptTargets + flatpakRuntimes,
    hasAptCleanup: aptTargets > 0,
  };
}
