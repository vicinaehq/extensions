import type { List } from "@vicinae/api";
import type { SoftwarePackage, SoftwareUpdate } from "../types";

export function installAccessories(
  pkg: SoftwarePackage,
): List.Item.Accessory[] {
  return [
    ...(pkg.source === "flatpak" ? [{ text: pkg.id }] : []),
    ...(pkg.installed ? [{ text: "Installed" }] : []),
    { tag: sourceLabel(pkg, "remote") },
  ];
}

export function removeAccessories(
  pkg: SoftwarePackage,
): List.Item.Accessory[] {
  return [
    { text: pkg.id },
    { tag: sourceLabel(pkg, "scope") },
  ];
}

export function updateAccessories(
  update: SoftwareUpdate,
): List.Item.Accessory[] {
  const version = update.currentVersion && update.availableVersion
    ? `${update.currentVersion} → ${update.availableVersion}`
    : update.availableVersion ?? "Update available";

  return [
    { text: version },
    ...(update.downloadSize ? [{ text: update.downloadSize }] : []),
    { tag: sourceLabel(update, "scope") },
  ];
}

export function sourceLabel(
  pkg: SoftwarePackage,
  detail: "remote" | "scope",
): string {
  if (pkg.source === "apt") return "APT";
  const value = detail === "remote"
    ? pkg.flatpak?.remote
    : pkg.flatpak?.scope;
  return `Flatpak · ${value ?? "unknown"}`;
}
