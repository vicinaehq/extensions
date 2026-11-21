import type { SoftwareItem } from "../types.ts";
import { isValidAptPackageId } from "./apt-parsing.ts";
import { isValidFlatpakAppId } from "./flatpak-parsing.ts";

export interface AppStreamComponent {
  id: string;
  kind: string;
  name: string;
  summary: string;
  description?: string;
  packageId?: string;
  flatpakId?: string;
  homepage?: string;
  categories?: string[];
  license?: string;
  iconName?: string;
  iconPath?: string;
}

const COMPONENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const ICON_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*\.(?:png|svg|xpm)$/i;

/**
 * Parses `appstreamcli` stanzas. When the output was cut off at a limit, the
 * final stanza may be missing fields and is discarded.
 */
export function parseAppStreamSearchOutput(
  output: string,
  limit = 100,
  truncated = false,
): AppStreamComponent[] {
  const components: AppStreamComponent[] = [];
  const stanzas = output.split(/^---\s*$/m);
  if (truncated) stanzas.pop();

  for (const rawStanza of stanzas) {
    if (components.length >= limit) break;
    const fields = parseFields(rawStanza);
    const identifier = fields.get("Identifier");
    const identifierMatch = identifier?.match(/^(.+?)\s+\[([^\]]+)]$/);
    const id = identifierMatch?.[1]?.trim();
    const kind = identifierMatch?.[2]?.trim();
    const name = fields.get("Name")?.trim();
    const summary = fields.get("Summary")?.trim();
    if (
      !id ||
      !kind ||
      !name ||
      !summary ||
      !COMPONENT_ID_PATTERN.test(id)
    ) {
      continue;
    }

    const rawPackageId = fields.get("Package")?.trim();
    const packageId = rawPackageId && isValidAptPackageId(rawPackageId)
      ? rawPackageId
      : undefined;
    const flatpakId = parseFlatpakBundle(fields.get("Bundle"));
    if (!packageId && !flatpakId) continue;

    const rawIconName = fields.get("Icon")?.trim();
    components.push({
      id,
      kind,
      name,
      summary: summary.replace(/\s+/g, " "),
      description: fields.get("Description")?.trim().replace(/\s+/g, " ") ||
        undefined,
      packageId,
      flatpakId,
      homepage: fields.get("Homepage")?.trim() || undefined,
      categories: parseList(fields.get("Categories")),
      license: fields.get("License")?.trim() || undefined,
      iconName: rawIconName && ICON_NAME_PATTERN.test(rawIconName)
        ? rawIconName
        : undefined,
    });
  }

  return components;
}

export function enrichSoftwareItems(
  items: readonly SoftwareItem[],
  components: readonly AppStreamComponent[],
): SoftwareItem[] {
  const aptComponents = preferredComponents(components, "packageId");
  const flatpakComponents = preferredComponents(components, "flatpakId");

  return items.map((pkg) => {
    const component = pkg.source === "apt"
      ? aptComponents.get(pkg.id)
      : flatpakComponents.get(pkg.id);
    if (!component) return pkg;

    return {
      ...pkg,
      name: component.name,
      description: component.summary,
      homepage: component.homepage ?? pkg.homepage,
      longDescription: component.description ?? pkg.longDescription,
      icon: component.iconPath ?? pkg.icon,
      appstream: {
        componentId: component.id,
        kind: component.kind,
        isGuiApplication: component.kind === "desktop-application",
        categories: component.categories,
        license: component.license,
      },
    };
  });
}

function parseFields(stanza: string): Map<string, string> {
  const fields = new Map<string, string>();
  let currentField: string | undefined;

  for (const line of stanza.split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
    if (field) {
      currentField = field[1];
      if (currentField) fields.set(currentField, field[2] ?? "");
      continue;
    }

    if (currentField && /^\s+\S/.test(line)) {
      const previous = fields.get(currentField) ?? "";
      fields.set(currentField, `${previous} ${line.trim()}`.trim());
    }
  }

  return fields;
}

function parseFlatpakBundle(bundle?: string): string | undefined {
  const id = bundle?.match(/^flatpak:app\/([^/]+)\/[^/]+\/[^/]+$/)?.[1];
  return id && isValidFlatpakAppId(id) ? id : undefined;
}

function parseList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = [...value.matchAll(/-\s+([A-Za-z0-9][A-Za-z0-9+._-]*)/g)]
    .map((match) => match[1])
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function preferredComponents(
  components: readonly AppStreamComponent[],
  key: "packageId" | "flatpakId",
): Map<string, AppStreamComponent> {
  const preferred = new Map<string, AppStreamComponent>();

  for (const component of components) {
    const id = component[key];
    if (!id) continue;
    const existing = preferred.get(id);
    if (!existing || componentPriority(component) < componentPriority(existing)) {
      preferred.set(id, component);
    }
  }

  return preferred;
}

function componentPriority(component: AppStreamComponent): number {
  const kindPriority = component.kind === "desktop-application"
    ? 0
    : component.kind === "console-application"
      ? 10
      : 20;
  return kindPriority - Number(Boolean(component.iconPath));
}
