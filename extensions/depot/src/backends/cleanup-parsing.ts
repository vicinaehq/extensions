import { isValidAptPackageId } from "./apt-parsing.ts";
import type { FlatpakScope } from "../types.ts";

export interface AptAutoremovePlan {
  packageIds: string[];
  reclaimableSpace?: string;
}

export interface AptArchiveCleanupItem {
  packageId: string;
  version: string;
  size?: string;
}

export interface FlatpakCleanupItem {
  id: string;
  scope: FlatpakScope;
  branch?: string;
}

export function parseAptAutoremoveSimulation(
  output: string,
): AptAutoremovePlan {
  const packageIds = new Set<string>();
  let reclaimableSpace: string | undefined;

  for (const line of output.split(/\r?\n/)) {
    const packageId = line.match(/^(?:Remv|Purg)\s+(\S+)/)?.[1];
    if (packageId && isValidAptPackageId(packageId)) {
      packageIds.add(packageId);
    }

    const space = line.match(
      /^After this operation,\s+(.+?)\s+disk space will be freed\.$/i,
    )?.[1];
    if (space) reclaimableSpace = space;
  }

  return { packageIds: [...packageIds], reclaimableSpace };
}

/** Compares a purge simulation with the package IDs the user reviewed. */
export function compareCleanupPlan(
  approvedIds: readonly string[],
  simulationOutput: string,
): { unexpected: string[]; missing: string[] } {
  const planned = parseAptAutoremoveSimulation(simulationOutput).packageIds;
  return {
    unexpected: planned.filter((id) => !approvedIds.includes(id)),
    missing: approvedIds.filter((id) => !planned.includes(id)),
  };
}

export function parseAptAutocleanSimulation(
  output: string,
): AptArchiveCleanupItem[] {
  const archives = new Map<string, AptArchiveCleanupItem>();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^Del\s+(\S+)\s+(\S+)(?:\s+\[([^\]]+)\])?$/);
    if (!match) continue;
    const [, packageId, version, size] = match;
    if (!packageId || !version || !isValidAptPackageId(packageId)) continue;
    archives.set(`${packageId}:${version}`, {
      packageId,
      version,
      size: size?.trim() || undefined,
    });
  }

  return [...archives.values()];
}

/**
 * Without root, `apt-get --simulate autoclean` lists the readable archives and
 * then exits 100 because /var/cache/apt/archives/partial is not readable.
 * True only when that is the sole error, so other failures still surface.
 */
export function isPartialCachePermissionFailure(output: string): boolean {
  const errors = output.split(/\r?\n/).filter((line) => line.startsWith("E: "));
  return errors.length > 0 && errors.every((line) =>
    /^E: Unable to read \/var\/cache\/apt\/archives\/partial\/? - .*\(13: Permission denied\)$/
      .test(line.trim())
  );
}

export function parseFlatpakUnusedPreview(
  output: string,
  scope: FlatpakScope,
): FlatpakCleanupItem[] {
  const items = new Map<string, FlatpakCleanupItem>();
  const plainOutput = output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");

  for (const line of plainOutput.split(/\r?\n/)) {
    const numberedRow = line.match(/^\s*\d+\.\s+(.+)$/)?.[1];
    if (!numberedRow) continue;
    const columns = numberedRow.trim().split(/\s+/);
    if (columns[0] === "[-]") columns.shift();
    const id = columns[0];
    const branch = columns[1];
    const operation = columns.at(-1)?.toLowerCase();
    if (
      !id ||
      columns.length < 3 ||
      operation !== "r" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]+$/.test(id)
    ) {
      continue;
    }
    const key = `${id}:${branch ?? "unknown"}`;
    items.set(key, { id, scope, branch });
  }

  return [...items.values()];
}
