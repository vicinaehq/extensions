import type { FlatpakScope } from "../types";

export interface FlatpakRemote {
  name: string;
  scope: FlatpakScope;
}

export interface FlatpakSearchRecord {
  id: string;
  name: string;
  description: string;
  version?: string;
  branch?: string;
  remotes: string[];
  scope: FlatpakScope;
}

export interface InstalledFlatpak {
  id: string;
  branch?: string;
  remote?: string;
  scope: FlatpakScope;
}

export interface InstalledFlatpakApplication extends InstalledFlatpak {
  name: string;
  description: string;
  version?: string;
}

export interface FlatpakUpdateRecord {
  id: string;
  name: string;
  description: string;
  availableVersion?: string;
  branch?: string;
  remote: string;
  downloadSize?: string;
  scope: FlatpakScope;
}

const APP_ID_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2,}$/;
const REMOTE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidFlatpakAppId(id: string): boolean {
  return APP_ID_PATTERN.test(id);
}

export function isValidFlatpakRemoteName(name: string): boolean {
  return REMOTE_NAME_PATTERN.test(name);
}

export function parseFlatpakRemotesOutput(
  output: string,
  scope: FlatpakScope,
): FlatpakRemote[] {
  const unique = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const name = line.split("\t", 1)[0]?.trim();
    if (name && isValidFlatpakRemoteName(name)) unique.add(name);
  }

  return [...unique].map((name) => ({ name, scope }));
}

export function parseFlatpakSearchOutput(
  output: string,
  scope: FlatpakScope,
): FlatpakSearchRecord[] {
  const records: FlatpakSearchRecord[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const [name, description, id, version, branch, remoteList] = line.split("\t");
    if (!id || !isValidFlatpakAppId(id)) continue;

    const remotes = (remoteList ?? "")
      .split(",")
      .map((remote) => remote.trim())
      .filter(isValidFlatpakRemoteName);
    if (remotes.length === 0) continue;

    records.push({
      id,
      name: name?.trim() || id,
      description: description?.trim() || "No description available",
      version: version?.trim() || undefined,
      branch: branch?.trim() || undefined,
      remotes,
      scope,
    });
  }

  return records;
}

export function parseFlatpakInstalledOutput(
  output: string,
  requestedScope: FlatpakScope,
): InstalledFlatpak[] {
  const installed: InstalledFlatpak[] = [];

  for (const line of output.split(/\r?\n/)) {
    const [id, branch, remote, reportedScope] = line.split("\t");
    if (!id || !isValidFlatpakAppId(id)) continue;

    const scope = reportedScope === "user" || reportedScope === "system"
      ? reportedScope
      : requestedScope;
    installed.push({
      id,
      branch: branch?.trim() || undefined,
      remote: remote && isValidFlatpakRemoteName(remote) ? remote : undefined,
      scope,
    });
  }

  return installed;
}

export function parseFlatpakInstalledApplicationsOutput(
  output: string,
  requestedScope: FlatpakScope,
): InstalledFlatpakApplication[] {
  const installed: InstalledFlatpakApplication[] = [];

  for (const line of output.split(/\r?\n/)) {
    const [name, description, id, version, branch, remote, reportedScope] =
      line.split("\t");
    if (!id || !isValidFlatpakAppId(id)) continue;

    const scope = reportedScope === "user" || reportedScope === "system"
      ? reportedScope
      : requestedScope;
    installed.push({
      id,
      name: name?.trim() || id,
      description: description?.trim() || "Installed Flatpak application",
      version: version?.trim() || undefined,
      branch: branch?.trim() || undefined,
      remote: remote && isValidFlatpakRemoteName(remote) ? remote : undefined,
      scope,
    });
  }

  return installed;
}

export function parseFlatpakUpdatesOutput(
  output: string,
  scope: FlatpakScope,
): FlatpakUpdateRecord[] {
  const updates: FlatpakUpdateRecord[] = [];

  for (const line of output.split(/\r?\n/)) {
    const [name, description, id, version, branch, remote, downloadSize] =
      line.split("\t");
    if (
      !id ||
      !isValidFlatpakAppId(id) ||
      !remote ||
      !isValidFlatpakRemoteName(remote)
    ) {
      continue;
    }

    updates.push({
      id,
      name: name?.trim() || id,
      description: description?.trim() || "Flatpak application update",
      availableVersion: version?.trim() || undefined,
      branch: branch?.trim() || undefined,
      remote,
      downloadSize: downloadSize?.trim() || undefined,
      scope,
    });
  }

  return updates;
}

export function selectFlatpakRemote(remotes: readonly string[]): string | undefined {
  return remotes.find((remote) => remote.toLocaleLowerCase() === "flathub")
    ?? remotes[0];
}

export function sortFlatpakScopes(
  scopes: readonly FlatpakScope[],
  preferredScope: FlatpakScope,
): FlatpakScope[] {
  return [...new Set(scopes)].sort((left, right) => {
    if (left === preferredScope) return -1;
    if (right === preferredScope) return 1;
    return left.localeCompare(right);
  });
}

export function selectFlatpakSearchScopes(
  remotes: readonly FlatpakRemote[],
  preferredScope: FlatpakScope,
): FlatpakScope[] {
  return sortFlatpakScopes(
    (["user", "system"] as const).filter(
      (scope) => remotes.some((remote) => remote.scope === scope),
    ),
    preferredScope,
  );
}

export function rankFlatpakSearchResults(
  records: readonly FlatpakSearchRecord[],
  query: string,
  preferredScope: FlatpakScope,
  limit: number,
): FlatpakSearchRecord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const unique = new Map<string, FlatpakSearchRecord>();

  for (const record of records) {
    const existing = unique.get(record.id);
    if (!existing || (
      record.scope === preferredScope && existing.scope !== preferredScope
    )) {
      unique.set(record.id, record);
    }
  }

  return [...unique.values()]
    .sort((left, right) => {
      const scoreDifference = scoreFlatpakRecord(left, normalizedQuery)
        - scoreFlatpakRecord(right, normalizedQuery);
      return scoreDifference || left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

function scoreFlatpakRecord(record: FlatpakSearchRecord, query: string): number {
  const name = record.name.toLocaleLowerCase();
  const id = record.id.toLocaleLowerCase();
  const description = record.description.toLocaleLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);

  if (name === query) return 0;
  if (id === query) return 5;
  if (name.startsWith(query)) return 10;
  if (id.split(".").some((part) => part === query)) return 15;
  if (tokens.every((token) => name.includes(token))) return 20;
  if (id.includes(query)) return 30;
  if (tokens.every((token) => description.includes(token))) return 50;
  return 60;
}
