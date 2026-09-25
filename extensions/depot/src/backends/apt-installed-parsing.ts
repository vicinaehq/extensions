const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9][a-z0-9-]*)?$/;

function isValidAptPackageId(id: string): boolean {
  return PACKAGE_ID_PATTERN.test(id);
}

export interface AptInstalledMetadata {
  id: string;
  installed: boolean;
  essential: boolean;
  priority?: string;
  section?: string;
}

export function parseDpkgOwnershipOutput(output: string): Map<string, string[]> {
  const ownership = new Map<string, string[]>();

  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf(": /");
    if (separator < 1) continue;

    const path = line.slice(separator + 2).trim();
    if (!path.endsWith(".desktop")) continue;

    const packages = line
      .slice(0, separator)
      .split(",")
      .map((id) => id.trim())
      .filter(isValidAptPackageId);
    if (packages.length > 0) ownership.set(path, packages);
  }

  return ownership;
}

export function parseDpkgInstalledMetadata(
  output: string,
): Map<string, AptInstalledMetadata> {
  const records = new Map<string, AptInstalledMetadata>();

  for (const line of output.split(/\r?\n/)) {
    const [id, status, essential, priority, section] = line.split("\t");
    if (!id || !isValidAptPackageId(id)) continue;
    records.set(id, {
      id,
      installed: status?.startsWith("ii") ?? false,
      essential: essential?.toLocaleLowerCase() === "yes",
      priority: priority?.trim() || undefined,
      section: section?.trim() || undefined,
    });
  }

  return records;
}

export function isConservativeRemovalCandidate(
  metadata: AptInstalledMetadata | undefined,
): boolean {
  if (!metadata?.installed || metadata.essential) return false;
  return metadata.priority !== "required" && metadata.priority !== "important";
}

export function parseAptRemovalSimulation(output: string): string[] {
  const packages: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    const id = line.match(/^Remv\s+(\S+)/)?.[1];
    if (id && isValidAptPackageId(id)) packages.push(id);
  }

  return packages;
}

export function resolveInstalledAptPackageId(
  requestedId: string,
  installedIds: ReadonlySet<string>,
): string | undefined {
  if (installedIds.has(requestedId)) return requestedId;
  if (requestedId.includes(":")) return undefined;

  const matches = [...installedIds].filter(
    (installedId) => installedId.split(":", 1)[0] === requestedId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function inspectAptRemovalPlan(
  targetId: string,
  plannedIds: readonly string[],
): { includesTarget: boolean; additionalIds: string[] } {
  const uniqueIds = [...new Set(plannedIds)];
  return {
    includesTarget: uniqueIds.includes(targetId),
    additionalIds: uniqueIds.filter((plannedId) => plannedId !== targetId),
  };
}

export function parseAptMarkOutput(output: string): Set<string> {
  return new Set(
    output
      .split(/\r?\n/)
      .map((id) => id.trim())
      .filter(isValidAptPackageId),
  );
}
