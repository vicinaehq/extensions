export interface AptSearchRecord {
  id: string;
  description: string;
}

export interface AptPackageDetails {
  id: string;
  description: string;
  longDescription?: string;
  version?: string;
  homepage?: string;
}

const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9][a-z0-9-]*)?$/;

export function isValidAptPackageId(id: string): boolean {
  return PACKAGE_ID_PATTERN.test(id);
}

export function escapeAptSearchPattern(query: string): string {
  return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseAptSearchOutput(output: string): AptSearchRecord[] {
  const records: AptSearchRecord[] = [];

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+-\s+(.*)$/);
    if (!match) continue;

    const id = match[1];
    const description = match[2]?.trim();
    if (!id || !description || !isValidAptPackageId(id)) continue;
    records.push({ id, description });
  }

  return records;
}

export function parseDpkgStatusOutput(output: string): Set<string> {
  const installed = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const [id, status] = line.split("\t", 2);
    if (id && status?.startsWith("ii")) installed.add(id);
  }

  return installed;
}

export function parseAptPackageDetails(
  output: string,
): AptPackageDetails | undefined {
  const firstStanza = output.split(/\r?\n\r?\n/, 1)[0]?.trim();
  if (!firstStanza) return undefined;

  const fields = new Map<string, string>();
  let currentField: string | undefined;

  for (const line of firstStanza.split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (field) {
      currentField = field[1];
      if (currentField) fields.set(currentField, field[2] ?? "");
      continue;
    }

    if (currentField && line.startsWith(" ")) {
      const previous = fields.get(currentField) ?? "";
      const continuation = line.slice(1) === "." ? "" : line.slice(1);
      fields.set(currentField, `${previous}\n${continuation}`);
    }
  }

  const id = fields.get("Package");
  if (!id || !isValidAptPackageId(id)) return undefined;

  const rawDescription = fields.get("Description-en") ?? fields.get("Description") ?? "";
  const [description = "", ...longDescription] = rawDescription.split("\n");

  return {
    id,
    description,
    longDescription: longDescription.join("\n").trim() || undefined,
    version: fields.get("Version") || undefined,
    homepage: fields.get("Homepage") || undefined,
  };
}

export function rankAptSearchResults(
  records: readonly AptSearchRecord[],
  query: string,
  limit: number,
): AptSearchRecord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const unique = new Map<string, AptSearchRecord>();

  for (const record of records) {
    const existing = unique.get(record.id);
    if (!existing || record.description.length > existing.description.length) {
      unique.set(record.id, record);
    }
  }

  return [...unique.values()]
    .sort((left, right) => {
      const scoreDifference =
        scoreAptRecord(left, normalizedQuery) - scoreAptRecord(right, normalizedQuery);
      return scoreDifference || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

function scoreAptRecord(record: AptSearchRecord, query: string): number {
  const id = record.id.toLocaleLowerCase();
  const description = record.description.toLocaleLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);
  const packageQuery = tokens.join("-");

  if (id === packageQuery) return 0;
  if (id.startsWith(`${packageQuery}-`)) return 10;
  if (id.startsWith(packageQuery)) return 20;
  if (tokens.every((token) => id.includes(token))) return 25;
  if (id.split(/[+.-]/).includes(query)) return 30;
  if (id.includes(query)) return 40;
  if (description.startsWith(query)) return 60;
  if (tokens.every((token) => description.includes(token))) return 65;
  if (description.includes(` ${query}`)) return 70;
  return 80;
}
