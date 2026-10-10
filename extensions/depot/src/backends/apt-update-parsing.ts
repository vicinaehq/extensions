export interface AptUpdateRecord {
  id: string;
  name: string;
  repository: string;
  architecture: string;
  currentVersion: string;
  availableVersion: string;
}

const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9][a-z0-9-]*)?$/;

export function parseAptUpgradableOutput(output: string): AptUpdateRecord[] {
  const records: AptUpdateRecord[] = [];

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /^([^/\s]+)\/(\S+)\s+(\S+)\s+(\S+)\s+\[upgradable from:\s*(.+)]$/,
    );
    if (!match) continue;

    const [, name, repository, availableVersion, architecture, currentVersion] =
      match;
    if (!name || !repository || !availableVersion || !architecture || !currentVersion) {
      continue;
    }

    const id = `${name}:${architecture}`;
    if (!PACKAGE_ID_PATTERN.test(id)) continue;
    records.push({
      id,
      name,
      repository,
      architecture,
      currentVersion,
      availableVersion,
    });
  }

  return records;
}
