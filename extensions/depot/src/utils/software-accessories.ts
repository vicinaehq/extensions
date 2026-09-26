import type { List } from "@vicinae/api";
import type { SoftwareItem, SoftwareUpdate } from "../types";

export function installAccessories(
  pkg: SoftwareItem,
): List.Item.Accessory[] {
  return [
    ...(pkg.source === "flatpak" ? [{ text: pkg.id }] : []),
    ...(pkg.installed ? [{ text: "Installed" }] : []),
    { tag: softwareSourceLabel(pkg, "remote") },
  ];
}

export function removeAccessories(
  pkg: SoftwareItem,
): List.Item.Accessory[] {
  return [
    { text: pkg.id },
    { tag: softwareSourceLabel(pkg, "scope") },
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
    { tag: softwareSourceLabel(update, "scope") },
  ];
}

export function softwareSourceLabel(
  pkg: SoftwareItem,
  detail: "remote" | "scope",
): string {
  if (pkg.source === "apt") return "APT";
  const value = detail === "remote"
    ? pkg.flatpak?.remote
    : pkg.flatpak?.scope;
  return `Flatpak · ${value ?? "unknown"}`;
}
