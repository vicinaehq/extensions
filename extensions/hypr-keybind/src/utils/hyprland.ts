import { promises as fs } from "fs";
import os from "os";
import path from "path";

export type HyprBind = {
  directive: string;
  modifiers: string;
  key: string;
  action: string;
  command: string;
  comment: string;
  lineNumber: number;
  configPath: string;
};

function expandTilde(p: string): string {
  if (!p) return p;
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p.replace("${HOME}", os.homedir()).replace("$HOME", os.homedir());
}

function trim(s: string): string {
  return s.replace(/^\s+|\s+$/g, "");
}

function joinWithCommas(parts: string[], startIdx: number): string {
  const slice = parts.slice(startIdx - 1);
  return trim(slice.join(","));
}

function jsonEscape(s: string): string {
  return s
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function mapMouseKey(k: string): string {
  const low = k.replace(/\s+/g, "").toLowerCase();
  if (low === "mouse:272") return "left click";
  if (low === "mouse:273") return "right click";
  if (low === "mouse:274") return "middle click";
  if (low === "mouse:wheelup") return "wheelup";
  if (low === "mouse:wheeldown") return "wheeldown";
  if (low === "mouse:wheelleft") return "wheelleft";
  if (low === "mouse:wheelright") return "wheelright";
  return k;
}

function parseDirectiveLine(
  raw: string,
  lineNumber: number,
  configPath: string,
): HyprBind | null {
  raw = raw.replace(/\r$/, "");

  // Match: optional spaces, directive starting with bind*, optional (flags), =, rhs
  const m = raw.match(/^\s*(bind[\w]*)\s*(\([^)]*\))?\s*=\s*(.*)$/);
  if (!m) return null;

  const directive = m[1];
  let rhs = m[3];

  // Inline comment extraction
  let comment = "";
  const hashPos = rhs.indexOf("#");
  if (hashPos > -1) {
    comment = trim(rhs.slice(hashPos + 1));
    rhs = trim(rhs.slice(0, hashPos));
  }

  // Split those Commas
  let parts = rhs.split(",").map((p) => trim(p));
  if (parts.length === 0) parts = [""];

  const mods = parts[0] ?? "";
  const key = parts[1] ?? "";

  let action = "";
  let command = "";

  if (directive === "bindd" || /^bindd[\w]*$/.test(directive)) {
    comment = parts[2] ?? "";
    action = parts[3] ?? "";
    if (parts.length >= 5) command = parts.slice(4).join(",").trim();
  } else {
    action = parts[2] ?? "";
    if (parts.length >= 4) command = parts.slice(3).join(",").trim();
  }

  // Swap out modifiers, future update maybe
  //let normMods = mods.replace(/\$varname/g, "SUPER");
  let normMods = mods;

  // Mouse key mapping if bindm or key contains mouse:
  let normKey = key;
  if (/^bindm(\W|$)|^bindm$/.test(directive) || /^mouse:/i.test(key)) {
    normKey = mapMouseKey(key);
  }

  return {
    directive: jsonEscape(directive),
    modifiers: jsonEscape(normMods),
    key: jsonEscape(normKey),
    action: jsonEscape(action),
    command: jsonEscape(command),
    comment: jsonEscape(comment),
    lineNumber: lineNumber,
    configPath: configPath,
  };
}

export async function readHyprlandConfig(configPath: string): Promise<string> {
  const full = expandTilde(configPath);
  return await fs.readFile(full, "utf8");
}

export function parseHyprlandKeybinds(
  contents: string,
  configPath: string,
): HyprBind[] {
  const lines = contents.split("\n");
  const results: HyprBind[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNumber = i + 1;
    // Ignore blank lines and comment lines
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) continue;
    const parsed = parseDirectiveLine(raw, lineNumber, configPath);
    if (parsed) results.push(parsed);
  }
  return results;
}

export async function getHyprlandKeybinds(
  configPath: string,
): Promise<HyprBind[]> {
  const text = await readHyprlandConfig(configPath);
  return parseHyprlandKeybinds(text, configPath);
}
