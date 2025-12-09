import path from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { Preferences } from "./types";
import { getPreferenceValues } from "@vicinae/api";
import { VSCODE_STATE_PATHS } from "./constants";

export function getVSCodeStateDBPath(): string {
    const home = homedir();
    const { vscodeFlavour } = getPreferenceValues<Preferences>();
    const platform = process.platform as keyof typeof VSCODE_STATE_PATHS;

    let dbPath: string;

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

    return dbPath;
}

export function decodeFileUri(uri: string): string {
    return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

export function getProjectLabel(projectPath: string, isWorkspace: boolean): string {
    if (isWorkspace) {
        return path.basename(projectPath, ".code-workspace");
    }
    return path.basename(projectPath);
}

export function sortProjectsByLastOpened<T extends { lastOpened: number }>(projects: T[]): T[] {
    return [...projects].sort((a, b) => b.lastOpened - a.lastOpened);
}
