import type { SoftwarePackage } from "../types";

export function safeHomepageUrl(value?: string): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]<>()#+\-.!|])/g, "\\$1");
}

export function packageDescriptionMarkdown(pkg: SoftwarePackage): string {
  const paragraphs = [pkg.description, pkg.longDescription]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => escapeMarkdown(value.trim()));

  return paragraphs.join("\n\n") || "No description is available.";
}

export function packageSourceLabel(pkg: SoftwarePackage): string {
  return pkg.source === "apt"
    ? "APT"
    : `Flatpak · ${pkg.flatpak?.remote ?? "unknown"}`;
}
