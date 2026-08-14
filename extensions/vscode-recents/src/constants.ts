import { VSCodeFlavour } from "./types";

export const RECENT_PROJECTS_QUERY = "SELECT key, value FROM ItemTable WHERE key LIKE 'history.recentlyOpenedPathsList'";

export const SQL_WASM_PATH = "assets/sql-wasm.wasm";

export const FILE_URI_SCHEME = "file://";

export const WORKSPACE_EXTENSION = ".code-workspace";

export const VSCODE_EXECUTABLES: Record<VSCodeFlavour, string> = {
    [VSCodeFlavour.Code]: "code",
    [VSCodeFlavour.CodeOSS]: "code",
    [VSCodeFlavour.Cursor]: "cursor",
    [VSCodeFlavour.VSCodium]: "codium",
    [VSCodeFlavour.Antigravity]: "antigravity",
    [VSCodeFlavour.Windsurf]: "windsurf",
    [VSCodeFlavour.CodeInsiders]: "code-insiders",
};

const VSCODE_SHARED_STORAGE_DIRS: Record<VSCodeFlavour, string> = {
    [VSCodeFlavour.Code]: ".vscode-shared",
    [VSCodeFlavour.CodeOSS]: ".vscode-oss-shared",
    [VSCodeFlavour.Cursor]: ".cursor-shared",
    [VSCodeFlavour.VSCodium]: ".vscode-oss-shared",
    [VSCodeFlavour.Antigravity]: ".antigravity-shared",
    [VSCodeFlavour.Windsurf]: ".vscode-shared",
    [VSCodeFlavour.CodeInsiders]: ".vscode-insiders-shared",
};

export const VSCODE_SHARED_STATE_PATHS = {
    linux: (home: string, flavour: VSCodeFlavour) => {
        const sharedDir = VSCODE_SHARED_STORAGE_DIRS[flavour];
        return `${home}/${sharedDir}/sharedStorage/state.vscdb`;
    },
    win32: (home: string, flavour: VSCodeFlavour) => {
        const sharedDir = VSCODE_SHARED_STORAGE_DIRS[flavour];
        return `${home}/AppData/Roaming/${sharedDir}/sharedStorage/state.vscdb`;
    },
    darwin: (home: string, flavour: VSCodeFlavour) => {
        const sharedDir = VSCODE_SHARED_STORAGE_DIRS[flavour];
        return `${home}/Library/Application Support/${sharedDir}/sharedStorage/state.vscdb`;
    },
} as const;

export const VSCODE_STATE_PATHS = {
    linux: (home: string, flavour: VSCodeFlavour) => `${home}/.config/${flavour}/User/globalStorage/state.vscdb`,
    win32: (home: string, flavour: VSCodeFlavour) => `${home}/AppData/Roaming/${flavour}/User/globalStorage/state.vscdb`,
    darwin: (home: string, flavour: VSCodeFlavour) => `${home}/Library/Application Support/${flavour}/User/globalStorage/state.vscdb`,
} as const;
