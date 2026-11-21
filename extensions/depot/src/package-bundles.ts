import { isValidAptPackageId } from "./backends/apt-parsing.ts";
import { isValidFlatpakAppId } from "./backends/flatpak-parsing.ts";
import { DepotOperationError } from "./errors.ts";
import { recentActionSource } from "./recent-actions.ts";
import type { SoftwareItem } from "./types.ts";

const MAX_PACKAGES = 100;

export class BundleError extends DepotOperationError<"invalid"> {
  constructor(message: string) {
    super("BundleError", "invalid", message);
  }
}

export interface BundlePackage {
  source: "apt" | "flatpak";
  id: string;
}

export interface SoftwareBundle {
  id: string;
  name: string;
  description: string;
  packages: BundlePackage[];
}

export type BundlePackageStatus =
  | "installed"
  | "available"
  | "unavailable"
  | "unsupported";

export interface ResolvedBundlePackage {
  entry: BundlePackage;
  status: BundlePackageStatus;
  pkg?: SoftwareItem;
  message?: string;
}

export const BUILT_IN_BUNDLES: readonly SoftwareBundle[] = [
  createBundle({
    id: "developer-essentials",
    name: "Developer Essentials",
    description: "Core tools for building software on Ubuntu.",
    apt: ["git", "curl", "build-essential"],
  }),
  createBundle({
    id: "creative-studio",
    name: "Creative Studio",
    description: "Image, illustration, recording, and media tools for creators.",
    apt: ["ffmpeg"],
    flatpak: [
      "org.gimp.GIMP",
      "org.inkscape.Inkscape",
      "com.obsproject.Studio",
    ],
  }),
];

export function createPackageListBundle(
  aptInput: string,
  flatpakInput: string,
): SoftwareBundle {
  return createBundle({
    id: "package-list",
    name: "Package List",
    description: "Packages entered directly in Depot.",
    apt: splitPackageList(aptInput),
    flatpak: splitPackageList(flatpakInput),
  });
}

export function resolvedBundlePackage(
  entry: BundlePackage,
  pkg?: SoftwareItem,
  message?: string,
): ResolvedBundlePackage {
  if (!pkg) return { entry, status: "unavailable", message };
  return {
    entry,
    status: pkg.installed ? "installed" : "available",
    pkg,
  };
}

export function unresolvedBundlePackage(
  entry: BundlePackage,
  status: Extract<BundlePackageStatus, "unavailable" | "unsupported">,
  message: string,
): ResolvedBundlePackage {
  return { entry, status, message };
}

interface BundleDefinition {
  id: string;
  name: string;
  description: string;
  apt?: readonly string[];
  flatpak?: readonly string[];
}

function createBundle(definition: BundleDefinition): SoftwareBundle {
  const apt = validateIds(definition.apt ?? [], "apt");
  const flatpak = validateIds(definition.flatpak ?? [], "flatpak");
  const packages: BundlePackage[] = [
    ...apt.map((id) => ({ source: "apt" as const, id })),
    ...flatpak.map((id) => ({ source: "flatpak" as const, id })),
  ];
  if (packages.length === 0) {
    throw new BundleError("Enter at least one APT or Flatpak package ID");
  }
  if (packages.length > MAX_PACKAGES) {
    throw new BundleError(`A package list cannot exceed ${MAX_PACKAGES} entries`);
  }
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    packages,
  };
}

function validateIds(
  values: readonly string[],
  source: BundlePackage["source"],
): string[] {
  const ids = values.map((value) => value.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const id of ids) {
    const valid = source === "apt"
      ? isValidAptPackageId(id)
      : isValidFlatpakAppId(id);
    if (!valid) {
      throw new BundleError(`Invalid ${recentActionSource(source)} package ID: ${id}`);
    }
    if (seen.has(id)) throw new BundleError(`Duplicate package ID: ${id}`);
    seen.add(id);
  }
  return ids;
}

function splitPackageList(value: string): string[] {
  return value.split(/[\s,]+/).filter(Boolean);
}
