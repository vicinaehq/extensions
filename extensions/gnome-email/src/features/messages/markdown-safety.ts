function plainLabel(value: string): string {
  return value.replace(/[\[\]()*_`~<>|\\]/g, "").replace(/\s+/g, " ").trim();
}

export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()<>#+\-.!|])/g, "\\$1");
}

export function hideMarkdownImages(markdown: string): string {
  const hidden = (_match: string, alt = "") => {
    const description = plainLabel(alt);
    return description ? `[Image hidden: ${description}]` : "[Image hidden]";
  };

  return markdown
    .replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, hidden)
    .replace(/<img\b[^>]*>/gi, () => "[Image hidden]")
    .replace(/!/g, "\\!");
}
