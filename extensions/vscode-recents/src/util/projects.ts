import { existsSync } from "fs";
import { queryRecentProjects } from "./database";
import { RecentProject, ProjectType, VSCodeRecentData, VSCodeDatabaseEntry } from "../types";
import { decodeFileUri, getProjectLabel, sortProjectsByLastOpened } from "../helpers";

function parseProjectEntry(entry: VSCodeDatabaseEntry): RecentProject | null {
    let projectPath = "";
    let type: ProjectType = ProjectType.Folder;

    if (entry.folderUri) {
        type = ProjectType.Folder;
        projectPath = decodeFileUri(entry.folderUri);
    } else if (entry.workspace) {
        type = ProjectType.Workspace;
        projectPath = decodeFileUri(entry.workspace.configPath);
    } else if (entry.fileUri) {
        type = ProjectType.File;
        projectPath = decodeFileUri(entry.fileUri);
    }

    // Skip if path is invalid or doesn't exist
    if (!projectPath || !existsSync(projectPath)) {
        return null;
    }

    const label = getProjectLabel(projectPath, type === ProjectType.Workspace);
    const lastOpened = entry.lastAccessTime || Date.now();

    return {
        type: type,
        label: label,
        path: projectPath,
        lastOpened: lastOpened,
    };
}

export function getRecentProjects(): RecentProject[] {
    const projects: RecentProject[] = [];

    try {
        const rows = queryRecentProjects();

        for (const row of rows) {
            try {
                const data: VSCodeRecentData = JSON.parse(row.value);

                // VSCode stores entries in the format { entries: [...] }
                if (data.entries && Array.isArray(data.entries)) {
                    for (const entry of data.entries) {
                        const project = parseProjectEntry(entry);
                        if (project) {
                            projects.push(project);
                        }
                    }
                }
            } catch (error) {
                console.error("Error parsing recent projects data", error);
            }
        }
    } catch (error) {
        console.error("Error getting recent projects: ", error);
        throw error;
    }

    return sortProjectsByLastOpened(projects);
}

export function filterProjects(projects: RecentProject[], query: string): RecentProject[] {
    if (!query.trim()) {
        return projects;
    }

    const searchText = query.toLowerCase();
    return projects.filter(
        (project) => project.label.toLowerCase().includes(searchText) || project.path.toLowerCase().includes(searchText),
    );
}
