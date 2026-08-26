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

// FIX(macOS/Windows): the shared storage directory hangs directly off the user's
// home directory on EVERY platform, not under the per-platform application data
// directory. VS Code resolves it as:
//     get appSharedDataHome() { ... return joinPath(this.userHome, this.productService.sharedDataFolderName) }
// (vs/platform/environment/node/environmentService.ts), and `userHome` is plain
// `os.homedir()`. The previous per-platform table only produced the right path on
// Linux; on macOS it pointed at "~/Library/Application Support/.vscode-shared",
// which never exists, so the lookup silently fell back to the legacy DB - a file
// that still exists but no longer holds `history.recentlyOpenedPathsList`,
// yielding an empty list with no error.
export const getSharedStateDBPath = (home: string, flavour: VSCodeFlavour): string => {
    const sharedDir = VSCODE_SHARED_STORAGE_DIRS[flavour];
    return `${home}/${sharedDir}/sharedStorage/state.vscdb`;
};

export const VSCODE_STATE_PATHS = {
    linux: (home: string, flavour: VSCodeFlavour) => `${home}/.config/${flavour}/User/globalStorage/state.vscdb`,
    win32: (home: string, flavour: VSCodeFlavour) => `${home}/AppData/Roaming/${flavour}/User/globalStorage/state.vscdb`,
    darwin: (home: string, flavour: VSCodeFlavour) => `${home}/Library/Application Support/${flavour}/User/globalStorage/state.vscdb`,
} as const;

// FIX(macOS): the Vicinae server is started by LaunchServices, so extensions inherit
// a bare `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. The `code` shim lives in /usr/local/bin
// (and Homebrew casks use /opt/homebrew/bin), neither of which is on that PATH, so
// `command -v <executable>` always failed and the extension only ever showed
// "Command not found". These are searched in addition to the inherited PATH.
export const MACOS_EXTRA_PATHS = ["/usr/local/bin", "/opt/homebrew/bin"];

// Last-resort lookup: the CLI shipped inside the application bundle itself, which
// exists even when the user never ran "Shell Command: Install 'code' command in PATH".
export const MACOS_APP_BUNDLES: Record<VSCodeFlavour, string> = {
    [VSCodeFlavour.Code]: "Visual Studio Code",
    [VSCodeFlavour.CodeOSS]: "Code - OSS",
    [VSCodeFlavour.Cursor]: "Cursor",
    [VSCodeFlavour.VSCodium]: "VSCodium",
    [VSCodeFlavour.Antigravity]: "Antigravity",
    [VSCodeFlavour.Windsurf]: "Windsurf",
    [VSCodeFlavour.CodeInsiders]: "Visual Studio Code - Insiders",
};
