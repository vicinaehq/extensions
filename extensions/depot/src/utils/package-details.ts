import type { SoftwareItem } from "../types.ts";

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

/**
 * Escapes markdown syntax in untrusted text. `$` and `~` are included because
 * Vicinae renders `$…$` as math and `~~…~~` as strikethrough.
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]<>()#+\-.!|$~])/g, "\\$1");
}

export function packageDescriptionMarkdown(pkg: SoftwareItem): string {
  const paragraphs = [pkg.description, pkg.longDescription]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => escapeMarkdown(value.trim()));

  return paragraphs.join("\n\n") || "No description is available.";
}

/**
 * Renders untrusted multi-line output verbatim in a fenced text block.
 * Backtick runs are broken with a zero-width space so the output cannot
 * close the fence and inject markdown.
 */
export function fencedTextBlock(value: string): string {
  return ["```text", value.replace(/`(?=`)/g, "`\u200b"), "```"].join("\n");
}
