import { dirname, join } from "path";
import { homedir } from "os";
import { OutputBlock, OutputConfigUpdate } from "./types";

const MONITORS_FILENAME = "monitors.kdl";

export function getNiriConfigPath(): string {
  const explicit = process.env.NIRI_CONFIG;
  if (explicit) return explicit;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "niri", "config.kdl");
}

export function getMonitorsConfigPath(): string {
  return join(dirname(getNiriConfigPath()), MONITORS_FILENAME);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips KDL block comments (/* *\/), line comments (//),
 * and node comments (/-) including those separated by newlines/whitespace.
 */
export function stripKdlComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/-[\s\r\n]*[^\s{;]+(?:[^{;\n]*\{[\s\S]*?\})?/g, "");
}

export function isInsideBlockComment(text: string, index: number): boolean {
  const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
  let match: RegExpExecArray | null;
  while ((match = blockCommentRegex.exec(text)) !== null) {
    if (index >= match.index && index < match.index + match[0].length) {
      return true;
    }
  }
  return false;
}

export function parseOutputBlockAt(
  config: string,
  matchIndex: number,
  outputName: string,
  headerLength: number,
): OutputBlock | null {
  const blockStart = matchIndex;
  const bodyStart = matchIndex + headerLength;
  let depth = 1;
  let i = bodyStart;
  while (i < config.length && depth > 0) {
    if (config[i] === "{") depth++;
    else if (config[i] === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;

  return {
    name: outputName,
    blockStart,
    blockEnd: i,
    bodyStart,
    bodyEnd: i - 1,
    fullBlock: config.slice(blockStart, i),
  };
}

export function findActiveOutputBlocks(config: string): OutputBlock[] {
  // Exclude node-commented (/-) output blocks
  const regex = /(?:(\/-[\s\r\n]*)?)(^[ \t]*output\s+"([^"]+)"\s*\{)/gm;
  const blocks: OutputBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(config)) !== null) {
    const isNodeCommented = Boolean(match[1]);
    if (isNodeCommented) continue;

    const headerMatch = match[2];
    const outputName = match[3];
    const matchIndex = match.index + (match[1] ? match[1].length : 0);

    if (isInsideBlockComment(config, matchIndex)) continue;

    const block = parseOutputBlockAt(
      config,
      matchIndex,
      outputName,
      headerMatch.length,
    );
    if (block) {
      blocks.push(block);
      regex.lastIndex = block.blockEnd;
    }
  }
  return blocks;
}

export function findSingleActiveOutputBlock(
  config: string,
  outputName: string,
): OutputBlock | null {
  const all = findActiveOutputBlocks(config);
  return all.find((b) => b.name === outputName) ?? null;
}

export function setValueLine(
  body: string,
  keyword: string,
  value: string,
): string {
  const lineRegex = new RegExp(`^([ \\t]*)${keyword}\\b.*$`, "m");
  if (lineRegex.test(body)) {
    return body.replace(lineRegex, `$1${keyword} ${value}`);
  }
  return `${body.replace(/\s+$/, "")}\n    ${keyword} ${value}\n`;
}

export function setBareLine(
  body: string,
  keyword: string,
  present: boolean,
): string {
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

export function hasActiveMonitorsInclude(config: string): boolean {
  const cleaned = stripKdlComments(config);
  const regex = new RegExp(
    `^[ \\t]*include\\s+(?:optional=\\S+\\s+)?["']\\.?/?${escapeRegExp(MONITORS_FILENAME)}["']`,
    "m",
  );
  return regex.test(cleaned);
}

export function ensureActiveInclude(config: string): {
  config: string;
  modified: boolean;
} {
  if (hasActiveMonitorsInclude(config)) {
    return { config, modified: false };
  }

  // Matches single-line `// include ...` OR node comment `/- include ...` (even across newlines `/- \n include ...`)
  const commentedRegex = new RegExp(
    `(?:^[ \\t]*//[ \\t]*include\\s+(?:optional=\\S+\\s+)?["']\\.?/?${escapeRegExp(MONITORS_FILENAME)}["']|/-(?:[ \\t]*\\r?\\n[ \\t]*|[ \\t]+)include\\s+(?:optional=\\S+\\s+)?["']\\.?/?${escapeRegExp(MONITORS_FILENAME)}["'])`,
    "m",
  );

  if (commentedRegex.test(config)) {
    const newConfig = config.replace(
      commentedRegex,
      `include "${MONITORS_FILENAME}"`,
    );
    return { config: newConfig, modified: true };
  }

  // Prepend include at top
  const includeLine = `include "${MONITORS_FILENAME}"\n`;
  const newConfig =
    config.length > 0 ? `${includeLine}\n${config}` : includeLine;
  return { config: newConfig, modified: true };
}

export function formatNewOutputBlock(
  outputName: string,
  update: OutputConfigUpdate,
): string {
  let body = "\n";
  body = setBareLine(body, "off", !update.enabled);
  body = setValueLine(body, "mode", `"${update.mode}"`);
  body = setValueLine(body, "scale", `${update.scale}`);
  body = setValueLine(body, "transform", `"${update.transform}"`);
  return `output "${outputName}" {${body}}\n`;
}
