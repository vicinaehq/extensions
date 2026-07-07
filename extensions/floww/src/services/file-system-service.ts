import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Workflow } from "../types/workflow";
import { getWorkflowSummary, parseWorkflowFile } from "../utils/config-parser";
import { FLOWW_CONFIG, SUPPORTED_FILE_EXTENSIONS } from "../utils/constants";
import { handleFileSystemError } from "../utils/error-handler";

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
		const entries = await readdir(FLOWW_CONFIG.WORKFLOWS_DIR, {
			withFileTypes: true,
		});

		const candidates = entries.filter(
			(entry) =>
				entry.isFile() &&
				SUPPORTED_FILE_EXTENSIONS.includes(
					extname(
						entry.name,
					).toLowerCase() as (typeof SUPPORTED_FILE_EXTENSIONS)[number],
				),
		);

		const statResults = await Promise.all(
			candidates.map((entry) =>
				stat(join(FLOWW_CONFIG.WORKFLOWS_DIR, entry.name)),
			),
		);

		const workflows = candidates.map((entry, i) => {
			const extension = extname(entry.name).toLowerCase();
			return {
				name: entry.name.replace(extension, ""),
				filePath: join(FLOWW_CONFIG.WORKFLOWS_DIR, entry.name),
				fileExtension: extension,
				lastModified: statResults[i].mtime,
			};
		});

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
	const workflows = await getFileSystemWorkflows();

	return Promise.all(
		workflows.map(async (workflow) => {
			try {
				const content = await readWorkflowFile(workflow.filePath);
				const config = parseWorkflowFile(content, workflow.fileExtension);
				return { ...workflow, description: getWorkflowSummary(config) };
			} catch {
				return { ...workflow, description: "Workflow file (parse error)" };
			}
		}),
	);
}
