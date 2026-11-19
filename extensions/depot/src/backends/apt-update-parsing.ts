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

/**
 * Returns `name:architecture` keys for packages an `apt-get --simulate
 * upgrade` would install. Held packages and updates deferred by Ubuntu's
 * phasing produce no `Inst` line.
 */
export function parseAptUpgradeSimulation(output: string): Set<string> {
  const keys = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /^Inst\s+([^\s:]+)(?::[a-z0-9-]+)?\s.*\[([a-z0-9-]+)\]\)/,
    );
    if (!match) continue;
    const id = `${match[1]}:${match[2]}`;
    if (PACKAGE_ID_PATTERN.test(id)) keys.add(id);
  }

  return keys;
}

/**
 * Keeps updates an `apt-get --simulate upgrade` would install now. Held
 * packages (`apt-mark showhold`, APT naming: bare for native, `name:arch`
 * for foreign) are excluded; a bare hold also excludes foreign siblings,
 * erring towards not updating.
 */
export function selectInstallableUpdates(
  records: readonly AptUpdateRecord[],
  upgradeable: ReadonlySet<string>,
  held: ReadonlySet<string>,
): AptUpdateRecord[] {
  return records.filter((record) =>
    upgradeable.has(record.id) &&
    !held.has(record.id) &&
    !held.has(record.name)
  );
}
