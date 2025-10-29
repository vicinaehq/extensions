import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Workflow } from "../types/workflow";
import { getWorkflowSummary, parseWorkflowFile } from "../utils/config-parser";
import { FLOWW_CONFIG, SUPPORTED_FILE_EXTENSIONS } from "../utils/constants";
import { handleCommandError, handleFileSystemError } from "../utils/error-handler";

/**
 * Check if config directory exists
 */
export async function configDirectoryExists(): Promise<boolean> {
  try {
    await stat(FLOWW_CONFIG.CONFIG_DIR);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if workflows directory exists
 */
export async function workflowsDirectoryExists(): Promise<boolean> {
  try {
    await stat(FLOWW_CONFIG.WORKFLOWS_DIR);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all available workflows from the filesystem
 */
async function getFileSystemWorkflows(): Promise<Workflow[]> {
  try {
    const files = await readdir(FLOWW_CONFIG.WORKFLOWS_DIR);
    const workflows: Workflow[] = [];

    for (const file of files) {
      const filePath = join(FLOWW_CONFIG.WORKFLOWS_DIR, file);
      const stats = await stat(filePath);

      if (stats.isFile()) {
        const extension = extname(file).toLowerCase();

        // Only process supported file extensions
        if (
          SUPPORTED_FILE_EXTENSIONS.includes(
            extension as (typeof SUPPORTED_FILE_EXTENSIONS)[number]
          )
        ) {
          const name = file.replace(extension, "");

          workflows.push({
            name,
            filePath,
            fileExtension: extension,
            lastModified: stats.mtime,
          });
        }
      }
    }

    // Sort workflows by name
    return workflows.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    const flowwError = handleFileSystemError(error, FLOWW_CONFIG.WORKFLOWS_DIR);
    throw new Error(flowwError.message);
  }
}

/**
 * Read a workflow file content
 */
export async function readWorkflowFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (error) {
    const flowwError = handleFileSystemError(error, filePath);
    throw new Error(flowwError.message);
  }
}

/**
 * Get workflows with enriched descriptions
 */
export async function getEnrichedWorkflows(): Promise<Workflow[]> {
  try {
    const workflows = await getFileSystemWorkflows();

    // Enrich workflows with descriptions
    for (const workflow of workflows) {
      try {
        const content = await readWorkflowFile(workflow.filePath);
        const config = parseWorkflowFile(content, workflow.fileExtension);
        workflow.description = getWorkflowSummary(config);
      } catch (_error) {
        // If we can't parse the file, just use a fallback description
        workflow.description = "Workflow file (parse error)";
      }
    }

    return workflows;
  } catch (error) {
    const flowwError = handleCommandError(error, "get enriched workflows");
    throw new Error(flowwError.message);
  }
}
