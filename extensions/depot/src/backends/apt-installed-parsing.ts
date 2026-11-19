import { isValidAptPackageId } from "./apt-parsing.ts";

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
      essential: essential?.toLowerCase() === "yes",
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

/**
 * Resolves a requested package against installed IDs that are already in APT
 * form (see toAptPackageId). A bare ID means the native architecture, so it
 * never matches a foreign-architecture installation.
 */
export function resolveInstalledAptPackageId(
  requestedId: string,
  installedIds: ReadonlySet<string>,
): string | undefined {
  return installedIds.has(requestedId) ? requestedId : undefined;
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

const SYSTEM_PROFILE_SECTIONS = new Set([
  "kernel",
  "admin",
  "metapackages",
  "oldlibs",
]);
const BOOT_PACKAGE_PATTERN =
  /^(?:grub|shim|efibootmgr$|linux-(?:image|generic|headers))/;

/**
 * Selects manually installed software worth restoring on another machine.
 * Installer-chosen boot, kernel, administration, and metapackages describe
 * the original system rather than the user's software.
 */
export function selectManualProfilePackageIds(
  manualIds: ReadonlySet<string>,
  metadata: ReadonlyMap<string, AptInstalledMetadata>,
): string[] {
  return [...manualIds]
    .filter((id) => {
      const record = metadata.get(id);
      if (!isConservativeRemovalCandidate(record)) return false;
      const section = record?.section?.split("/").at(-1);
      return !(section && SYSTEM_PROFILE_SECTIONS.has(section)) &&
        !BOOT_PACKAGE_PATTERN.test(id);
    })
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Converts a dpkg identifier to APT's form: dpkg qualifies native
 * "Multi-Arch: same" packages (`libjcat1:amd64`) where APT prints
 * `libjcat1`. Foreign-architecture qualifiers are kept.
 */
export function toAptPackageId(
  dpkgId: string,
  nativeArchitecture: string,
): string {
  const suffix = `:${nativeArchitecture}`;
  return dpkgId.endsWith(suffix) ? dpkgId.slice(0, -suffix.length) : dpkgId;
}
