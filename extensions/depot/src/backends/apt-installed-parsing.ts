import { isValidAptPackageId } from "./apt-parsing.ts";

export interface AptInstalledMetadata {
  id: string;
  installed: boolean;
  essential: boolean;
  priority?: string;
  section?: string;
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

export function parseAptMarkOutput(output: string): Set<string> {
  return new Set(
    output
      .split(/\r?\n/)
      .map((id) => id.trim())
      .filter(isValidAptPackageId),
  );
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
