import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";
import { handleError } from "./utils";

export interface OutputConfigUpdate {
  enabled: boolean;
  mode: string;
  scale: number;
  transform: string;
}

const MONITORS_FILENAME = "monitors.kdl";

function getNiriConfigPath(): string {
  // Mirrors niri's own lookup order (short of a --config CLI override, which we have no way to know about from here).
  const explicit = process.env.NIRI_CONFIG;
  if (explicit) return explicit;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "niri", "config.kdl");
}

function getMonitorsConfigPath(): string {
  return join(dirname(getNiriConfigPath()), MONITORS_FILENAME);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findOutputBlock(
  config: string,
  outputName: string,
): { bodyStart: number; bodyEnd: number } | null {
  const headerRegex = new RegExp(
    `output\\s+"${escapeRegExp(outputName)}"\\s*\\{`,
    "i",
  );
  const match = headerRegex.exec(config);
  if (!match) return null;

  const bodyStart = match.index + match[0].length;
  let depth = 1;
  let i = bodyStart;
  while (i < config.length && depth > 0) {
    if (config[i] === "{") depth++;
    else if (config[i] === "}") depth--;
    i++;
  }
  if (depth !== 0) return null; // unbalanced braces — leave the file untouched

  return { bodyStart, bodyEnd: i - 1 };
}

function setValueLine(body: string, keyword: string, value: string): string {
  const lineRegex = new RegExp(`^([ \\t]*)${keyword}\\b.*$`, "m");
  if (lineRegex.test(body)) {
    return body.replace(lineRegex, `$1${keyword} ${value}`);
  }
  return `${body.replace(/\s+$/, "")}\n    ${keyword} ${value}\n`;
}

function setBareLine(body: string, keyword: string, present: boolean): string {
  const lineRegex = new RegExp(`^[ \\t]*${keyword}[ \\t]*$`, "m");
  const hasLine = lineRegex.test(body);
  if (present && !hasLine) {
    return `${body.replace(/\s+$/, "")}\n    ${keyword}\n`;
  }
  if (!present && hasLine) {
    return body.replace(lineRegex, "").replace(/\n{3,}/g, "\n\n");
  }
  return body;
}

function hasMonitorsInclude(config: string): boolean {
  // Matches `include "monitors.kdl"`, `include './monitors.kdl'`,
  // and the optional=true variant, with either quote style.
  const includeRegex = new RegExp(
    `include\\s+(?:optional=\\S+\\s+)?["']\\.?/?${escapeRegExp(MONITORS_FILENAME)}["']`,
  );
  return includeRegex.test(config);
}

/**
 * Makes sure config.kdl includes monitors.kdl. Only ever prepends a
 * single `include` line — never touches the rest of config.kdl, and
 * does nothing if the include is already there (from a previous save,
 * or one the user added themselves).
 */
async function ensureMonitorsIncluded(): Promise<void> {
  const configPath = getNiriConfigPath();

  let config = "";
  try {
    config = await readFile(configPath, "utf-8");
  } catch {
    config = ""; // no main config file yet — we'll create a minimal one
  }

  if (hasMonitorsInclude(config)) return;

  const includeLine = `include "${MONITORS_FILENAME}"\n`;
  config = config.length > 0 ? `${includeLine}\n${config}` : includeLine;

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, config, "utf-8");
}

export async function upsertOutputConfig(
  outputName: string,
  update: OutputConfigUpdate,
): Promise<boolean> {
  try {
    await ensureMonitorsIncluded();

    const monitorsPath = getMonitorsConfigPath();
    let monitorsConfig = "";
    try {
      monitorsConfig = await readFile(monitorsPath, "utf-8");
    } catch {
      monitorsConfig = ""; // no monitors.kdl yet — we'll create one
    }

    const existing = findOutputBlock(monitorsConfig, outputName);
    let body = existing
      ? monitorsConfig.slice(existing.bodyStart, existing.bodyEnd)
      : "\n";

    body = setBareLine(body, "off", !update.enabled);
    body = setValueLine(body, "mode", `"${update.mode}"`);
    body = setValueLine(body, "scale", `${update.scale}`);
    body = setValueLine(body, "transform", `"${update.transform}"`);

    if (existing) {
      monitorsConfig =
        monitorsConfig.slice(0, existing.bodyStart) +
        body +
        monitorsConfig.slice(existing.bodyEnd);
    } else {
      const block = `output "${outputName}" {${body}}\n`;
      monitorsConfig =
        monitorsConfig.trimEnd().length > 0
          ? `${monitorsConfig.trimEnd()}\n\n${block}`
          : block;
    }

    await mkdir(dirname(monitorsPath), { recursive: true });
    await writeFile(monitorsPath, monitorsConfig, "utf-8");
    return true;
  } catch (error) {
    handleError("Failed to update niri config", error);
    return false;
  }
}

/**
 * Writes the given monitor settings into a dedicated monitors.kdl file
 * next to niri's main config, and makes sure config.kdl includes it.
 *
 * - If monitors.kdl doesn't exist yet, it's created with just this
 *   monitor's `output "<name>" { ... }` block, and an `include
 *   "monitors.kdl"` line is added to the top of config.kdl.
 * - If monitors.kdl already exists, only that monitor's block is
 *   updated or inserted — any other monitors already configured in
 *   the file are left exactly as they were.
 * - config.kdl itself is never rewritten wholesale — at most, one
 *   include line is prepended to it, once.
 *
 * niri live-reloads both files on save (included files are watched
 * too), so no extra reload step is needed. If the resulting KDL were
 * ever invalid, niri keeps the last known-good config and shows its
 * own desktop notification rather than crashing — so a bad write here
 * is recoverable, not catastrophic.
 *
 * Known limitations:
 * - This does a text-level match on `output "name" {` and won't
 *   recognize a block disabled with a `/-` node comment — it would
 *   (incorrectly) edit inside it.
 * - If a monitor's settings are already defined directly inside
 *   config.kdl (rather than in monitors.kdl), that block is left as
 *   is and could conflict with the one written here. Move any
 *   existing output blocks into monitors.kdl to avoid that.
 */
