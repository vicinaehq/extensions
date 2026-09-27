import { basename, dirname, isAbsolute, join, resolve } from "path";
import { homedir } from "os";
import { OutputBlock, OutputConfigUpdate } from "./types";

const OUTPUTS_FILENAME = "outputs.kdl";
const LEGACY_MONITORS_FILENAME = "monitors.kdl";

export function getNiriConfigPath(): string {
  const explicit = process.env.NIRI_CONFIG;
  if (explicit) return explicit;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "niri", "config.kdl");
}

export function findActiveIncludePaths(config: string): string[] {
  const regex =
    /^[ \t]*include\s+(?:optional=\S+\s+)?["']([^"']+)["']/gm;
  const includePaths: string[] = [];

  for (const match of config.matchAll(regex)) {
    const matchIndex = match.index;
    const isNodeCommented = /\/-[\s\r\n]*$/.test(
      config.slice(0, matchIndex),
    );
    if (!isNodeCommented && !isInsideBlockComment(config, matchIndex)) {
      includePaths.push(match[1]);
    }
  }

  return includePaths;
}

function getIncludeDirectory(includePath: string): string {
  const globIndex = includePath.search(/[*?[]/);
  if (globIndex === -1) return dirname(includePath);
  return dirname(`${includePath.slice(0, globIndex)}placeholder`);
}

export function getOutputsIncludePath(config: string): string {
  const includePaths = findActiveIncludePaths(config);
  const existingOutputsInclude = includePaths.find(
    (includePath) => basename(includePath) === OUTPUTS_FILENAME,
  );
  if (existingOutputsInclude) return existingOutputsInclude;

  const legacyMonitorsInclude = includePaths.find(
    (includePath) => basename(includePath) === LEGACY_MONITORS_FILENAME,
  );
  if (legacyMonitorsInclude) {
    return join(dirname(legacyMonitorsInclude), OUTPUTS_FILENAME);
  }

  const nestedInclude = includePaths.find(
    (includePath) => getIncludeDirectory(includePath) !== ".",
  );
  return nestedInclude
    ? join(getIncludeDirectory(nestedInclude), OUTPUTS_FILENAME)
    : OUTPUTS_FILENAME;
}

export function getOutputsConfigPath(config: string): string {
  return resolveNiriIncludePath(getOutputsIncludePath(config));
}

export function resolveNiriIncludePath(includePath: string): string {
  if (includePath.startsWith("~/")) {
    return join(homedir(), includePath.slice(2));
  }
  if (isAbsolute(includePath)) return includePath;
  return resolve(dirname(getNiriConfigPath()), includePath);
}

export function getLegacyMonitorsIncludePaths(config: string): string[] {
  return findActiveIncludePaths(config).filter(
    (includePath) => basename(includePath) === LEGACY_MONITORS_FILENAME,
  );
}

export function removeActiveIncludes(
  config: string,
  includePaths: string[],
): string {
  if (includePaths.length === 0) return config;

  const pathsToRemove = new Set(includePaths);
  const regex =
    /^[ \t]*include\s+(?:optional=\S+\s+)?["']([^"']+)["'][^\r\n]*(?:\r?\n|$)/gm;
  const matches = Array.from(config.matchAll(regex));
  let result = config;

  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const matchIndex = match.index;
    const isNodeCommented = /\/-[\s\r\n]*$/.test(
      config.slice(0, matchIndex),
    );
    if (
      pathsToRemove.has(match[1]) &&
      !isNodeCommented &&
      !isInsideBlockComment(config, matchIndex)
    ) {
      result =
        result.slice(0, matchIndex) + result.slice(matchIndex + match[0].length);
    }
  }

  return result;
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

export function hasActiveOutputsInclude(
  config: string,
  outputsIncludePath = OUTPUTS_FILENAME,
): boolean {
  const cleaned = stripKdlComments(config);
  const regex = new RegExp(
    `^[ \\t]*include\\s+(?:optional=\\S+\\s+)?["']${escapeRegExp(outputsIncludePath)}["']`,
    "m",
  );
  return regex.test(cleaned);
}

export function ensureActiveInclude(
  config: string,
  outputsIncludePath = OUTPUTS_FILENAME,
): {
  config: string;
  modified: boolean;
} {
  let configWithoutInclude = removeActiveIncludes(config, [outputsIncludePath]);

  // Matches single-line `// include ...` OR node comment `/- include ...` (even across newlines `/- \n include ...`)
  const commentedRegex = new RegExp(
    `(?:^[ \\t]*//[ \\t]*include\\s+(?:optional=\\S+\\s+)?["']${escapeRegExp(outputsIncludePath)}["']|/-(?:[ \\t]*\\r?\\n[ \\t]*|[ \\t]+)include\\s+(?:optional=\\S+\\s+)?["']${escapeRegExp(outputsIncludePath)}["'])`,
    "m",
  );

  if (!hasActiveOutputsInclude(config, outputsIncludePath)) {
    configWithoutInclude = configWithoutInclude.replace(commentedRegex, "");
  }

  // Keep this import first so the extension-managed output configuration takes
  // precedence over output blocks loaded from other files.
  const includeLine = `include "${outputsIncludePath}"\n`;
  const remainingConfig = configWithoutInclude.replace(/^(?:\r?\n)+/, "");
  const newConfig =
    remainingConfig.length > 0
      ? `${includeLine}\n${remainingConfig}`
      : includeLine;
  return { config: newConfig, modified: newConfig !== config };
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
