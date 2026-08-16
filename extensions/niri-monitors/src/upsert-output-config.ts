import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { handleError } from "./global-utils";
import { OutputConfigUpdate } from "./types";
import {
  ensureActiveInclude,
  findActiveOutputBlocks,
  findSingleActiveOutputBlock,
  formatNewOutputBlock,
  getMonitorsConfigPath,
  getNiriConfigPath,
  setBareLine,
  setValueLine,
} from "./config-utils";

const HEADER_COMMENT =
  "// This file is generated and managed by the Vicinae Niri Monitors extension.\n\n";

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
        const existingInMonitors = findSingleActiveOutputBlock(
          monitorsConfig,
          block.name,
        );

        if (existingInMonitors) {
          // Replace monitors.kdl block with active definition from main config
          monitorsConfig =
            monitorsConfig.slice(0, existingInMonitors.blockStart) +
            block.fullBlock +
            monitorsConfig.slice(existingInMonitors.blockEnd);
        } else {
          // Append to monitors.kdl
          monitorsConfig =
            monitorsConfig.trimEnd().length > 0
              ? `${monitorsConfig.trimEnd()}\n\n${block.fullBlock}\n`
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

    // 3. Upsert the target monitor in monitorsConfig
    const targetBlock = findSingleActiveOutputBlock(monitorsConfig, outputName);
    if (targetBlock) {
      let body = monitorsConfig.slice(
        targetBlock.bodyStart,
        targetBlock.bodyEnd,
      );
      body = setBareLine(body, "off", !update.enabled);
      body = setValueLine(body, "mode", `"${update.mode}"`);
      body = setValueLine(body, "scale", `${update.scale}`);
      body = setValueLine(body, "transform", `"${update.transform}"`);

      monitorsConfig =
        monitorsConfig.slice(0, targetBlock.bodyStart) +
        body +
        monitorsConfig.slice(targetBlock.bodyEnd);
    } else {
      const newBlock = formatNewOutputBlock(outputName, update);
      monitorsConfig =
        monitorsConfig.trimEnd().length > 0
          ? `${monitorsConfig.trimEnd()}\n\n${newBlock}`
          : newBlock;
    }

    // 4. Ensure header comment at top of monitors.kdl
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
