import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { dirname } from "path";
import { handleError } from "./global-utils";
import { OutputConfigUpdate } from "./types";
import {
  ensureActiveInclude,
  findActiveOutputBlocks,
  findSingleActiveOutputBlock,
  formatNewOutputBlock,
  getLegacyMonitorsIncludePaths,
  getOutputsConfigPath,
  getOutputsIncludePath,
  getNiriConfigPath,
  removeActiveIncludes,
  resolveNiriIncludePath,
  setBareLine,
  setValueLine,
} from "./config-utils";

const HEADER_COMMENT =
  "// This file is generated and managed by the Vicinae Niri Monitors extension.\n\n";

function mergeLegacyOutputs(
  outputsConfig: string,
  legacyConfig: string,
): string {
  if (outputsConfig.trim().length === 0) return legacyConfig;

  let mergedConfig = outputsConfig;
  for (const block of findActiveOutputBlocks(legacyConfig)) {
    if (!findSingleActiveOutputBlock(mergedConfig, block.name)) {
      mergedConfig = `${mergedConfig.trimEnd()}\n\n${block.fullBlock}\n`;
    }
  }
  return mergedConfig;
}

export async function upsertOutputConfig(
  outputName: string,
  update: OutputConfigUpdate,
): Promise<boolean> {
  try {
    const configPath = getNiriConfigPath();

    let mainConfig = "";
    try {
      mainConfig = await readFile(configPath, "utf-8");
    } catch {
      mainConfig = "";
    }

    const outputsIncludePath = getOutputsIncludePath(mainConfig);
    const outputsPath = getOutputsConfigPath(mainConfig);
    const legacyIncludePaths = getLegacyMonitorsIncludePaths(mainConfig);

    let outputsConfig = "";
    try {
      outputsConfig = await readFile(outputsPath, "utf-8");
    } catch {
      outputsConfig = "";
    }

    let mainConfigModified = false;
    const migratedLegacyPaths: string[] = [];

    // 1. Migrate files created under the extension's previous monitors.kdl name.
    for (const legacyIncludePath of legacyIncludePaths) {
      const legacyPath = resolveNiriIncludePath(legacyIncludePath);
      if (legacyPath === outputsPath || migratedLegacyPaths.includes(legacyPath)) {
        continue;
      }

      try {
        const legacyConfig = await readFile(legacyPath, "utf-8");
        outputsConfig = mergeLegacyOutputs(outputsConfig, legacyConfig);
        migratedLegacyPaths.push(legacyPath);
      } catch {
        // Keep the old import when its file cannot be read.
      }
    }

    if (migratedLegacyPaths.length > 0) {
      const migratedIncludes = legacyIncludePaths.filter((includePath) =>
        migratedLegacyPaths.includes(resolveNiriIncludePath(includePath)),
      );
      mainConfig = removeActiveIncludes(mainConfig, migratedIncludes);
      mainConfigModified = true;
    }

    // 2. Ensure the active output include is at the top of the main config.
    const includeResult = ensureActiveInclude(mainConfig, outputsIncludePath);
    if (includeResult.modified) {
      mainConfig = includeResult.config;
      mainConfigModified = true;
    }

    // 3. Find and migrate all active output blocks from config.kdl
    const activeMainBlocks = findActiveOutputBlocks(mainConfig);
    if (activeMainBlocks.length > 0) {
      for (const block of activeMainBlocks) {
        const existingInOutputs = findSingleActiveOutputBlock(
          outputsConfig,
          block.name,
        );

        if (existingInOutputs) {
          // Replace outputs.kdl block with active definition from main config
          outputsConfig =
            outputsConfig.slice(0, existingInOutputs.blockStart) +
            block.fullBlock +
            outputsConfig.slice(existingInOutputs.blockEnd);
        } else {
          // Append to outputs.kdl
          outputsConfig =
            outputsConfig.trimEnd().length > 0
              ? `${outputsConfig.trimEnd()}\n\n${block.fullBlock}\n`
              : `${block.fullBlock}\n`;
        }
      }

      // Remove migrated active blocks from config.kdl (in reverse order to preserve indices)
      for (let i = activeMainBlocks.length - 1; i >= 0; i--) {
        const block = activeMainBlocks[i];
        const before = mainConfig.slice(0, block.blockStart).trimEnd();
        const after = mainConfig.slice(block.blockEnd).trimStart();
        mainConfig = before + (after ? `\n\n${after}` : "\n");
      }
      mainConfigModified = true;
    }

    // 4. Upsert the target monitor in outputsConfig
    const targetBlock = findSingleActiveOutputBlock(outputsConfig, outputName);
    if (targetBlock) {
      let body = outputsConfig.slice(
        targetBlock.bodyStart,
        targetBlock.bodyEnd,
      );
      body = setBareLine(body, "off", !update.enabled);
      body = setValueLine(body, "mode", `"${update.mode}"`);
      body = setValueLine(body, "scale", `${update.scale}`);
      body = setValueLine(body, "transform", `"${update.transform}"`);

      outputsConfig =
        outputsConfig.slice(0, targetBlock.bodyStart) +
        body +
        outputsConfig.slice(targetBlock.bodyEnd);
    } else {
      const newBlock = formatNewOutputBlock(outputName, update);
      outputsConfig =
        outputsConfig.trimEnd().length > 0
          ? `${outputsConfig.trimEnd()}\n\n${newBlock}`
          : newBlock;
    }

    // 5. Ensure header comment at top of outputs.kdl
    if (
      !outputsConfig
        .trimStart()
        .startsWith(
          "// This file is generated and managed by the Vicinae Niri Monitors extension.",
        )
    ) {
      outputsConfig = `${HEADER_COMMENT}${outputsConfig.trimStart()}`;
    }

    // 6. Write the new file before switching imports and deleting legacy files.
    await mkdir(dirname(outputsPath), { recursive: true });
    await writeFile(outputsPath, outputsConfig, "utf-8");

    if (mainConfigModified) {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, mainConfig, "utf-8");
    }

    for (const legacyPath of migratedLegacyPaths) {
      await unlink(legacyPath);
    }

    return true;
  } catch (error) {
    handleError("Failed to update niri config", error);
    return false;
  }
}
