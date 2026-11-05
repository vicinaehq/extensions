export interface DesktopEntry {
  name: string;
  description: string;
  hidden: boolean;
  noDisplay: boolean;
}

export function parseDesktopEntry(content: string): DesktopEntry | undefined {
  let inDesktopEntry = false;
  const fields = new Map<string, string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const group = line.match(/^\[([^\]]+)]$/)?.[1];
    if (group) {
      inDesktopEntry = group === "Desktop Entry";
      continue;
    }
    if (!inDesktopEntry) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    if (key.includes("[")) continue;
    fields.set(key, unescapeDesktopValue(line.slice(separator + 1)));
  }

  const name = fields.get("Name")?.trim();
  if (!name || fields.get("Type") !== "Application" || !fields.get("Exec")) {
    return undefined;
  }

  return {
    name,
    description: fields.get("Comment")?.trim() || "Installed application",
    hidden: fields.get("Hidden")?.toLocaleLowerCase() === "true",
    noDisplay: fields.get("NoDisplay")?.toLocaleLowerCase() === "true",
  };
}

function unescapeDesktopValue(value: string): string {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\s/g, " ")
    .replace(/\\\\/g, "\\");
}
