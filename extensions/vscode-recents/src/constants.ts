export const RECENT_PROJECTS_QUERY = "SELECT key, value FROM ItemTable WHERE key LIKE 'history.recentlyOpenedPathsList'";

export const SQL_WASM_PATH = "assets/sql-wasm.wasm";

export const FILE_URI_SCHEME = "file://";

export const WORKSPACE_EXTENSION = ".code-workspace";

// Note: needs to match Preferences.vscodeFlavour values
export const VSCODE_EXECUTABLES: Record<string, string> = {
    Code: "code",
    Cursor: "cursor",
    VSCodium: "codium",
    Antigravity: "antigravity",
    "Code - Insiders": "code-insiders",
};

const VSCODE_SHARED_STORAGE_DIRS: Record<string, string> = {
    "Code": ".vscode-shared",
    "Cursor": ".cursor-shared",
    "VSCodium": ".vscodium-shared",
    "Antigravity": ".antigravity-shared",
    "Code - Insiders": ".vscode-insiders-shared",
};

export const VSCODE_SHARED_STATE_PATHS = {
    linux: (home: string, flavour: string) => {
        const sharedDir = VSCODE_SHARED_STORAGE_DIRS[flavour] || ".vscode-shared";
        return `${home}/${sharedDir}/sharedStorage/state.vscdb`;
    },
    win32: (home: string, flavour: string) => {
        const sharedDir = VSCODE_SHARED_STORAGE_DIRS[flavour] || ".vscode-shared";
        return `${home}/AppData/Roaming/${sharedDir}/sharedStorage/state.vscdb`;
    },
    darwin: (home: string, flavour: string) => {
        const sharedDir = VSCODE_SHARED_STORAGE_DIRS[flavour] || ".vscode-shared";
        return `${home}/Library/Application Support/${sharedDir}/sharedStorage/state.vscdb`;
    },
} as const;

export const VSCODE_STATE_PATHS = {
    linux: (home: string, flavour: string) => `${home}/.config/${flavour}/User/globalStorage/state.vscdb`,
    win32: (home: string, flavour: string) => `${home}/AppData/Roaming/${flavour}/User/globalStorage/state.vscdb`,
    darwin: (home: string, flavour: string) => `${home}/Library/Application Support/${flavour}/User/globalStorage/state.vscdb`,
} as const;
