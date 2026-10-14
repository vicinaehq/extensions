import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export type Keybinding = {
  section: string;
  name: string;
  bindings: string[];
  command?: string;
  source: string;
};

type SchemaDefinition = {
  section: string;
  schema: string;
};

const SCHEMAS: SchemaDefinition[] = [
  {
    section: "Windows",
    schema: "org.gnome.desktop.wm.keybindings",
  },
  {
    section: "GNOME Shell",
    schema: "org.gnome.shell.keybindings",
  },
  {
    section: "Mutter / Compositor",
    schema: "org.gnome.mutter.keybindings",
  },
  {
    section: "System & Multimedia",
    schema: "org.gnome.settings-daemon.plugins.media-keys",
  },
];

const CUSTOM_KEYBINDING_SCHEMA = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";
const MEDIA_KEYS_SCHEMA = "org.gnome.settings-daemon.plugins.media-keys";

async function run(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });

  return stdout.trim();
}

async function gsettings(args: string[]): Promise<string> {
  return run("gsettings", args);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const SCHEMA_DIRS = [
  "/usr/share/glib-2.0/schemas",
  "/usr/local/share/glib-2.0/schemas",
];

const schemaSummaryCache = new Map<string, Record<string, string>>();

function loadSchemaSummaries(schemaName: string): Record<string, string> {
  if (schemaSummaryCache.has(schemaName)) {
    return schemaSummaryCache.get(schemaName)!;
  }

  const summaries: Record<string, string> = {};

  for (const dir of SCHEMA_DIRS) {
    const filePath = join(dir, `${schemaName}.gschema.xml`);
    if (!existsSync(filePath)) continue;

    try {
      const xml = readFileSync(filePath, "utf-8");
      const keyRegex = /<key\s+name="([^"]+)">([\s\S]*?)<\/key>/g;
      let match: RegExpExecArray | null;
      while ((match = keyRegex.exec(xml)) !== null) {
        const keyName = match[1];
        const body = match[2];
        if (!keyName || !body) continue;
        const summaryMatch = body.match(/<summary>([^<]*)<\/summary>/);
        const summary = summaryMatch?.[1];
        if (summary) {
          summaries[keyName] = summary.trim();
        }
      }
    } catch {
      // Ignore unreadable files
    }
    break;
  }

  schemaSummaryCache.set(schemaName, summaries);
  return summaries;
}

function getKeyName(schema: string, key: string): string {
  const summaries = loadSchemaSummaries(schema);
  if (summaries[key]) return summaries[key];

  return key
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseQuotedValues(value: string): string[] {
  const matches: string[] = [];
  const regex = /'((?:\\'|[^'])*)'/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    const captured = match[1] ?? "";
    matches.push(captured.replace(/\\'/g, "'").trim());
  }

  return matches.filter(Boolean);
}

function looksLikeKeybinding(value: string): boolean {
  if (!value || value === "disabled") return false;

  return (
    value.includes("<") ||
    value.startsWith("XF86") ||
    value === "Print" ||
    value === "Pause" ||
    value === "Scroll_Lock" ||
    value === "Menu" ||
    /^F\d{1,2}$/i.test(value)
  );
}

function parseShortcutValue(value: string): string[] {
  if (value === "@as []" || value === "[]" || value === "''" || value === "'disabled'") {
    return [];
  }

  return parseQuotedValues(value).filter(looksLikeKeybinding);
}

function prettyKeyName(key: string): string {
  const map: Record<string, string> = {
    Primary: "Ctrl",
    Control: "Ctrl",
    Super: "Super",
    Shift: "Shift",
    Alt: "Alt",
    Meta: "Meta",
    Hyper: "Hyper",
    ISO_Level3_Shift: "AltGr",
    space: "Space",
    Return: "Enter",
    KP_Enter: "Enter",
    Escape: "Esc",
    BackSpace: "Backspace",
    Delete: "Delete",
    Print: "Print",
    Tab: "Tab",
    Left: "Left",
    Right: "Right",
    Up: "Up",
    Down: "Down",
    Home: "Home",
    End: "End",
    Page_Up: "Page Up",
    Page_Down: "Page Down",
  };

  if (map[key]) return map[key];

  if (key.startsWith("XF86")) {
    return key
      .replace(/^XF86/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/Audio/g, "Audio ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (key.length === 1) return key.toUpperCase();
  if (/^F\d{1,2}$/i.test(key)) return key.toUpperCase();

  return key.replace(/_/g, " ");
}

export function formatBinding(binding: string): string {
  const parts: string[] = [];
  const regex = /<([^>]+)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(binding)) !== null) {
    const raw = match[1] ?? match[2] ?? "";
    const cleaned = raw.trim();
    if (cleaned) parts.push(prettyKeyName(cleaned));
  }

  return parts.length > 0 ? parts.join(" + ") : binding;
}

async function schemaExists(schema: string): Promise<boolean> {
  try {
    const schemas = await gsettings(["list-schemas"]);
    return schemas.split("\n").includes(schema);
  } catch {
    return false;
  }
}

async function readSchema(definition: SchemaDefinition): Promise<Keybinding[]> {
  if (!(await schemaExists(definition.schema))) return [];

  const output = await gsettings(["list-recursively", definition.schema]);
  const items: Keybinding[] = [];

  for (const line of output.split("\n")) {
    const parts = line.split(" ");
    if (parts.length < 3) continue;

    const schema = parts[0] ?? definition.schema;
    const key = parts[1] ?? "";
    const rawValue = line.slice(`${schema} ${key} `.length);
    const bindings = parseShortcutValue(rawValue);

    if (bindings.length === 0) continue;

    items.push({
      section: definition.section,
      name: getKeyName(definition.schema, key),
      bindings: unique(bindings.map(formatBinding)),
      source: key,
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function getString(schemaWithPath: string, key: string): Promise<string> {
  try {
    const value = await gsettings(["get", schemaWithPath, key]);
    return parseQuotedValues(value)[0] ?? "";
  } catch {
    return "";
  }
}

async function readCustomShortcuts(): Promise<Keybinding[]> {
  if (!(await schemaExists(MEDIA_KEYS_SCHEMA))) return [];

  let rawPaths = "";
  try {
    rawPaths = await gsettings(["get", MEDIA_KEYS_SCHEMA, "custom-keybindings"]);
  } catch {
    return [];
  }

  const paths = parseQuotedValues(rawPaths);
  const items: Keybinding[] = [];

  for (const path of paths) {
    const schemaWithPath = `${CUSTOM_KEYBINDING_SCHEMA}:${path}`;
    const [name, command, binding] = await Promise.all([
      getString(schemaWithPath, "name"),
      getString(schemaWithPath, "command"),
      getString(schemaWithPath, "binding"),
    ]);

    if (!looksLikeKeybinding(binding)) continue;

    items.push({
      section: "Custom",
      name: normalizeWhitespace(name || command || "Custom shortcut"),
      command: normalizeWhitespace(command),
      bindings: [formatBinding(binding)],
      source: path,
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readGnomeKeybindings(): Promise<Keybinding[]> {
  const custom = await readCustomShortcuts();
  const groups = await Promise.all(SCHEMAS.map(readSchema));

  return [...custom, ...groups.flat()];
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/`/g, "\\`");
}

function renderTable(items: Keybinding[]): string {
  const hasCommand = items.some((item) => item.command);
  const headers = hasCommand ? "| Shortcut | Action | Command |\n|---|---|---|" : "| Shortcut | Action |\n|---|---|";

  const rows = items.map((item) => {
    const binding = item.bindings.map(markdownEscape).join(" / ");
    const name = markdownEscape(item.name);

    if (hasCommand) {
      const command = item.command ? `\`${markdownEscape(item.command)}\`` : "";
      return `| \`${binding}\` | ${name} | ${command} |`;
    }

    return `| \`${binding}\` | ${name} |`;
  });

  return [headers, ...rows].join("\n");
}

export function renderKeybindingsMarkdown(items: Keybinding[]): string {
  if (items.length === 0) {
    return [
      "# GNOME Keybindings",
      "",
      "No active shortcuts found via `gsettings`.",
      "",
      "Make sure you are running Vicinae inside a GNOME session and `gsettings` is available.",
    ].join("\n");
  }

  const sections = unique(items.map((item) => item.section));
  const lines: string[] = [
    "# GNOME Keybindings",
    "",
    "Shortcuts automatically detected from `gsettings` / `dconf`.",
    "",
  ];

  for (const section of sections) {
    const sectionItems = items.filter((item) => item.section === section);
    if (sectionItems.length === 0) continue;

    lines.push(`## ${section}`);
    lines.push("");
    lines.push(renderTable(sectionItems));
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Dynamically generated. No manual shortcut file to maintain.");

  return lines.join("\n");
}
