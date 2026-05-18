import path from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { getPreferenceValues } from "@vicinae/api";
import { VSCODE_SHARED_STATE_PATHS, VSCODE_STATE_PATHS } from "./constants";
import { type Preferences, ProjectEnvironment, ProjectType, type RecentProject } from "./types";

export function getVSCodeStateDBPath(): string {
    const home = homedir();
    const { vscodeFlavour } = getPreferenceValues<Preferences>();
    const platform = process.platform as keyof typeof VSCODE_STATE_PATHS;

    // Try the new shared storage path first (VS Code 1.118+)
    // Each flavor has its own shared storage directory
    let dbPath: string;
    if (platform in VSCODE_SHARED_STATE_PATHS) {
        dbPath = VSCODE_SHARED_STATE_PATHS[platform](home, vscodeFlavour);
    } else {
        // Default to Linux path for unsupported platforms
        dbPath = VSCODE_SHARED_STATE_PATHS.linux(home, vscodeFlavour);
    }

    // If the shared storage path exists, use it
    if (existsSync(dbPath)) {
        console.log("[DEBUG] Using shared storage path:", dbPath);
        return dbPath;
    }

    // Fall back to legacy per-flavor path (pre VS Code 1.118)
    if (platform in VSCODE_STATE_PATHS) {
        dbPath = VSCODE_STATE_PATHS[platform](home, vscodeFlavour);
    } else {
        // Default to Linux path for unsupported platforms
        dbPath = VSCODE_STATE_PATHS.linux(home, vscodeFlavour);
    }

    if (!existsSync(dbPath)) {
        throw new Error(
            `Database for ${vscodeFlavour} not found at: ${dbPath}. Make sure it's installed and that you have opened it at least once.`,
        );
    }

    console.log("[DEBUG] Using legacy flavor-specific path:", dbPath);
    return dbPath;
}

export function decodeFileUri(uri: string): string {
    return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

export function getProjectLabel(projectType: ProjectType, projectPath: string, projectLabel: string | undefined = undefined): string {
    return path.basename(projectLabel ?? projectPath) + (projectType === ProjectType.Workspace ? ".code-workspace" : "");
}

export function sortProjectsByLastOpenedOrIndex(projects: RecentProject[]): RecentProject[] {
    return [...projects].sort((a, b) => {
        if (b.lastOpened && a.lastOpened) {
            return b.lastOpened - a.lastOpened;
        }
        return 0;
    });
}

function getRemoteName(authority: string): string {
    const pos = authority.indexOf("+");
    if (pos < 0) {
        return authority;
    }
    return authority.substring(0, pos);
}

export function parseRemoteAuthority(authority?: string): {
    environment: ProjectEnvironment;
    machineName?: string;
} {
    if (!authority) {
        return { environment: ProjectEnvironment.Local };
    }

    const remoteName = getRemoteName(authority);
    const machineName = remoteName.length < authority.length ? authority.substring(remoteName.length + 1) : undefined;

    // Find matching environment by comparing enum values
    const environment = (Object.values(ProjectEnvironment) as string[]).includes(remoteName)
        ? (remoteName as ProjectEnvironment)
        : ProjectEnvironment.Local;

    return { environment, machineName };
}

export function validateProjectPath(projectPath: string, environment: ProjectEnvironment): boolean {
    if (!projectPath) {
        return false;
    }

    // Only validate local paths exist on the filesystem
    // Remote paths cannot be validated locally
    if (environment === ProjectEnvironment.Local) {
        return existsSync(projectPath);
    }

    return true;
}
