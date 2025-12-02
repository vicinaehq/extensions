import path from "path";
import { homedir } from "os";
import { promisify } from "util";
import { exec } from "child_process";
import { existsSync, readFile } from "fs";
import initSqlJs, { Database } from "sql.js";
import { showToast, Toast, Icon, List } from "@vicinae/api";

let DATABASE: Database;
const read = promisify(readFile);
const execAsync = promisify(exec);

export enum ProjectType {
	File = "file",
	Folder = "folder",
	Workspace = "workspace",
}

export interface RecentProject {
	path: string;
	label: string;
	type: ProjectType;
	lastOpened: number;
}

export function getVSCodeStateDBPath(): string {
	const home = homedir();
	const platform = process.platform;

	if (platform === "darwin") {
		return path.join(
			home,
			"Library",
			"Application Support",
			"Code",
			"User",
			"globalStorage",
			"state.vscdb",
		);
	} else if (platform === "win32") {
		return path.join(
			home,
			"AppData",
			"Roaming",
			"Code",
			"User",
			"globalStorage",
			"state.vscdb",
		);
	} else {
		return path.join(
			home,
			".config",
			"Code",
			"User",
			"globalStorage",
			"state.vscdb",
		);
	}
}

export async function initializeDatabase(): Promise<Database> {
	if (DATABASE) {
		return DATABASE;
	}

	let dbPath = getVSCodeStateDBPath();
	if (!existsSync(dbPath)) {
		throw new Error(`state.vscdb not found at: ${dbPath}`);
	}

	const bufferRaw = await read(dbPath);
	const SQL = await initSqlJs({
		locateFile: () => path.resolve(__dirname, "assets/sql-wasm.wasm"),
	});

	console.log("[DEBUG] Loaded VS Code state database from:", dbPath);
	DATABASE = new SQL.Database(new Uint8Array(bufferRaw));
	return DATABASE;
}

export function getIcon(type: ProjectType): Icon {
	switch (type) {
		case ProjectType.Workspace:
			return Icon.Document;
		case ProjectType.Folder:
			return Icon.Folder;
		case ProjectType.File:
			return Icon.BlankDocument;
		default:
			return Icon.QuestionMark;
	}
}

export function getTypeLabel(type: ProjectType): List.Item.Tag {
	switch (type) {
		case ProjectType.Workspace:
			return "Workspace";
		case ProjectType.Folder:
			return "Folder";
		case ProjectType.File:
			return "File";
		default:
			return "Unknown";
	}
}

export function getRecentProjects(): RecentProject[] {
	const projects: RecentProject[] = [];

	try {
		const statement = DATABASE.prepare(
			`SELECT key, value FROM ItemTable WHERE key LIKE 'history.recentlyOpenedPathsList'`,
		);

		while (statement.step()) {
			const row = statement.getAsObject();
			if (row.value) {
				try {
					const data = JSON.parse(row.value as string);

					// VS Code stores entries in the format { entries: [...] }
					if (data.entries && Array.isArray(data.entries)) {
						for (const entry of data.entries) {
							let projectPath = "";
							let type: ProjectType = ProjectType.Folder;

							if (entry.folderUri) {
								type = ProjectType.Folder;
								projectPath = decodeURIComponent(
									entry.folderUri.replace("file://", ""),
								);
							} else if (entry.workspace) {
								type = ProjectType.Workspace;
								projectPath = decodeURIComponent(
									entry.workspace.configPath.replace("file://", ""),
								);
							} else if (entry.fileUri) {
								type = ProjectType.File;
								projectPath = decodeURIComponent(
									entry.fileUri.replace("file://", ""),
								);
							}

							if (projectPath && existsSync(projectPath)) {
								const label =
									type === ProjectType.Workspace
										? path.basename(projectPath, ".code-workspace")
										: path.basename(projectPath);

								projects.push({
									type: type,
									label: label,
									path: projectPath,
									lastOpened: entry.lastAccessTime || Date.now(),
								});
							}
						}
					}
				} catch (error) {
					console.error("Error parsing recent projects data:", error);
				}
			}
		}
		statement.free();
	} catch (error) {
		console.error("Error querying database:", error);
	}

	return projects;
}

export function openCodeAtPath(projectPath: string) {
	try {
		execAsync(`code --new-window "${projectPath}"`);
	} catch (error) {
		console.error("Error opening project in VS Code:", error);
		showErrorToast("Error", `Failed to open in VS Code: ${String(error)}`);
	}
}

export function showErrorToast(title: string, message: string) {
	showToast({
		title: title,
		message: message,
		style: Toast.Style.Failure,
	});
}
