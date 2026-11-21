import type { SoftwareItem, SoftwareUpdate } from "../types.ts";

export function softwareItemKey(pkg: SoftwareItem): string {
  return pkg.source === "flatpak"
    ? `flatpak:${pkg.flatpak?.scope ?? "unknown"}:${pkg.id}`
    : `apt:${pkg.id}`;
}

export function sortSoftwareAlphabetically<T extends SoftwareItem>(
  packages: readonly T[],
): T[] {
  return [...packages].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
      numeric: true,
    }) || left.id.localeCompare(right.id, undefined, {
      sensitivity: "base",
      numeric: true,
    })
  );
}

export function removeSoftwareUpdates(
  updates: readonly SoftwareUpdate[],
  completed: readonly SoftwareUpdate[],
): SoftwareUpdate[] {
  const completedKeys = new Set(completed.map(softwareItemKey));
  return updates.filter((update) => !completedKeys.has(softwareItemKey(update)));
}
