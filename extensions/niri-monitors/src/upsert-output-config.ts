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
const HEADER_COMMENT =
  "// This file is generated and managed by the Vicinae Niri Monitors extension.\n\n";

function getNiriConfigPath(): string {
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

interface OutputBlock {
  name: string;
  blockStart: number;
  blockEnd: number;
  bodyStart: number;
  bodyEnd: number;
  fullBlock: string;
}

function isInsideBlockComment(text: string, index: number): boolean {
  const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
  let match: RegExpExecArray | null;
  while ((match = blockCommentRegex.exec(text)) !== null) {
    if (index >= match.index && index < match.index + match[0].length) {
      return true;
    }
  }
  return false;
}

function parseOutputBlockAt(
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
  if (depth !== 0) return null; // Unbalanced braces

  return {
    name: outputName,
    blockStart,
    blockEnd: i,
    bodyStart,
    bodyEnd: i - 1,
    fullBlock: config.slice(blockStart, i),
  };
}

function findActiveOutputBlocks(config: string): OutputBlock[] {
  // Matches `output "name" {` at start of line (excluding commented lines //, /-, #)
  const regex = /^[ \t]*output\s+"([^"]+)"\s*\{/gm;
  const blocks: OutputBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(config)) !== null) {
    if (isInsideBlockComment(config, match.index)) continue;
    const block = parseOutputBlockAt(
      config,
      match.index,
      match[1],
      match[0].length,
    );
    if (block) {
      blocks.push(block);
      regex.lastIndex = block.blockEnd;
    }
  }
  return blocks;
}

function findSingleActiveOutputBlock(
  config: string,
  outputName: string,
): OutputBlock | null {
  const regex = new RegExp(
    `^[ \\t]*output\\s+"${escapeRegExp(outputName)}"\\s*\\{`,
    "gm",
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(config)) !== null) {
    if (isInsideBlockComment(config, match.index)) continue;
    return parseOutputBlockAt(config, match.index, outputName, match[0].length);
  }
  return null;
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

function hasActiveMonitorsInclude(config: string): boolean {
  const stripped = config.replace(/\/\*[\s\S]*?\*\//g, "");
  const regex = new RegExp(
    `^[ \\t]*include\\s+(?:optional=\\S+\\s+)?["']\\.?/?${escapeRegExp(MONITORS_FILENAME)}["']`,
    "m",
  );
  return regex.test(stripped);
}

function ensureActiveInclude(config: string): {
  config: string;
  modified: boolean;
} {
  if (hasActiveMonitorsInclude(config)) {
    return { config, modified: false };
  }

  // Check if a line comment or node comment exists for include
  const commentedRegex = new RegExp(
    `^[ \\t]*(?://|/-)[ \\t]*include\\s+(?:optional=\\S+\\s+)?["']\\.?/?${escapeRegExp(MONITORS_FILENAME)}["']`,
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

function formatNewOutputBlock(
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

export async function upsertOutputConfig(
  outputName: string,
  update: OutputConfigUpdate,
): Promise<boolean> {
  try {
    const configPath = getNiriConfigPath();
    const monitorsPath = getMonitorsConfigPath();

    let mainConfig = "";
    try {
      mainConfig = await readFile(configPath, "utf-8");
    } catch {
      mainConfig = "";
    }

    let monitorsConfig = "";
    try {
      monitorsConfig = await readFile(monitorsPath, "utf-8");
    } catch {
      monitorsConfig = "";
    }

    let mainConfigModified = false;

    // 1. Ensure active include directive in main config
    const includeResult = ensureActiveInclude(mainConfig);
    if (includeResult.modified) {
      mainConfig = includeResult.config;
      mainConfigModified = true;
    }

    // 2. Find and migrate all active output blocks from config.kdl
    const activeMainBlocks = findActiveOutputBlocks(mainConfig);
    if (activeMainBlocks.length > 0) {
      for (const block of activeMainBlocks) {
        // If this output is not yet in monitors.kdl, copy its block over
        if (!findSingleActiveOutputBlock(monitorsConfig, block.name)) {
          monitorsConfig =
            monitorsConfig.trimEnd().length > 0
              ? `${monitorsConfig.trimEnd()}\n\n${block.fullBlock}\n`
              : `${block.fullBlock}\n`;
        }
      }

      // Remove migrated active blocks from config.kdl (in reverse to preserve indices)
      for (let i = activeMainBlocks.length - 1; i >= 0; i--) {
        const block = activeMainBlocks[i];
        const before = mainConfig.slice(0, block.blockStart).trimEnd();
        const after = mainConfig.slice(block.blockEnd).trimStart();
        mainConfig = before + (after ? `\n\n${after}` : "\n");
      }
      mainConfigModified = true;
    }

    // 3. Upsert the target monitor in monitorsConfig
    const existingInMonitors = findSingleActiveOutputBlock(
      monitorsConfig,
      outputName,
    );
    if (existingInMonitors) {
      let body = monitorsConfig.slice(
        existingInMonitors.bodyStart,
        existingInMonitors.bodyEnd,
      );
      body = setBareLine(body, "off", !update.enabled);
      body = setValueLine(body, "mode", `"${update.mode}"`);
      body = setValueLine(body, "scale", `${update.scale}`);
      body = setValueLine(body, "transform", `"${update.transform}"`);

      monitorsConfig =
        monitorsConfig.slice(0, existingInMonitors.bodyStart) +
        body +
        monitorsConfig.slice(existingInMonitors.bodyEnd);
    } else {
      const newBlock = formatNewOutputBlock(outputName, update);
      monitorsConfig =
        monitorsConfig.trimEnd().length > 0
          ? `${monitorsConfig.trimEnd()}\n\n${newBlock}`
          : newBlock;
    }

    // 4. Ensure header comment at the top of monitors.kdl
    if (
      !monitorsConfig
        .trimStart()
        .startsWith(
          "// This file is generated and managed by the Vicinae Niri Monitors extension.",
        )
    ) {
      monitorsConfig = `${HEADER_COMMENT}${monitorsConfig.trimStart()}`;
    }

    // 5. Write files
    if (mainConfigModified) {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, mainConfig, "utf-8");
    }

    await mkdir(dirname(monitorsPath), { recursive: true });
    await writeFile(monitorsPath, monitorsConfig, "utf-8");

    return true;
  } catch (error) {
    handleError("Failed to update niri config", error);
    return false;
  }
}
