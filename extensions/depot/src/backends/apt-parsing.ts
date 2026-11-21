

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
