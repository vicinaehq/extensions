import { homedir } from "os";
import { existsSync } from "fs";
import { promisify } from "util";
import { exec } from "child_process";
import { type Preferences, ProjectType, type RecentProject, WindowPreference } from "../types";
import { MACOS_APP_BUNDLES, MACOS_EXTRA_PATHS, VSCODE_EXECUTABLES } from "../constants";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";

const execAsync = promisify(exec);

const getVSCodeExecutable = (): string => {
    const { vscodeFlavour } = getPreferenceValues<Preferences>();
    const executable = VSCODE_EXECUTABLES[vscodeFlavour];

    if (!executable) {
        throw new Error(`Unknown VSCode flavour: ${vscodeFlavour}`);
    }

    return executable;
};

/**
 * FIX(macOS): the Vicinae server is launched by LaunchServices rather than from a
 * login shell, so extensions inherit `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. The
 * `code` shim installed by "Shell Command: Install 'code' command in PATH" lives in
 * /usr/local/bin, and Homebrew casks use /opt/homebrew/bin - neither is on that
 * PATH. `command -v code` therefore always failed and the extension could never
 * open anything, only ever showing the "Command not found" toast.
 */
const getSearchPath = (): string => {
    const inherited = process.env.PATH ?? "";

    if (process.platform !== "darwin") {
        return inherited;
    }

    const entries = inherited.split(":").filter(Boolean);
    const extra = [...MACOS_EXTRA_PATHS, `${homedir()}/.local/bin`].filter((dir) => !entries.includes(dir));

    return [...entries, ...extra].join(":");
};

/**
 * Last resort on macOS: the CLI that ships inside the application bundle. It is
 * present even when the user never installed the shell command.
 */
const getBundledExecutable = (): string | null => {
    if (process.platform !== "darwin") {
        return null;
    }

    const { vscodeFlavour } = getPreferenceValues<Preferences>();
    const appName = MACOS_APP_BUNDLES[vscodeFlavour];

    if (!appName) {
        return null;
    }

    const executable = VSCODE_EXECUTABLES[vscodeFlavour];
    const candidates = [
        `/Applications/${appName}.app/Contents/Resources/app/bin/${executable}`,
        `${homedir()}/Applications/${appName}.app/Contents/Resources/app/bin/${executable}`,
    ];

    return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

const resolveExecutable = async (searchPath: string): Promise<string | null> => {
    const executable = getVSCodeExecutable();

    try {
        const { stdout } = await execAsync(`command -v ${executable}`, { env: { ...process.env, PATH: searchPath } });
        const resolved = stdout.trim();

        if (resolved) {
            return resolved;
        }
    } catch {
        // Not on PATH; fall through to the bundled CLI.
    }

    return getBundledExecutable();
};

/**
 * FIX: `project.path` is a decoded filesystem path (decodeFileUri strips the
 * `file://` prefix and percent-decodes it), but it was being passed straight to
 * `--folder-uri`, which parses its argument as a URI. A path containing `#` or `?`
 * therefore loses everything from that character onwards, and the editor silently
 * opens the truncated path instead. Local paths are now re-encoded into a proper
 * file URI; remote paths already are URIs and are passed through untouched.
 */
const toFolderUri = (projectPath: string): string => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(projectPath)) {
        return projectPath;
    }

    return new URL(`file://${projectPath.split("/").map(encodeURIComponent).join("/")}`).href;
};

export const openProjectInVSCode = async (project: RecentProject): Promise<void> => {
    const { vscodeFlavour, windowPreference } = getPreferenceValues<Preferences>();
    const searchPath = getSearchPath();

    try {
        const executable = await resolveExecutable(searchPath);

        if (!executable) {
            showToast({
                title: "Command not found",
                style: Toast.Style.Failure,
                message: `Could not locate the '${getVSCodeExecutable()}' command for ${vscodeFlavour}.`,
            });
            return;
        }

        let command = JSON.stringify(executable);

        if (windowPreference === WindowPreference.NewWindow) {
            command += " --new-window";
        } else if (windowPreference === WindowPreference.ReuseWindow) {
            command += " --reuse-window";
        }

        const uri = toFolderUri(project.path);

        if (project.type === ProjectType.Folder) {
            command += ` --folder-uri "${uri}"`;
        } else {
            command += ` --file-uri "${uri}"`;
        }

        const { NODE_ENV, ...env } = process.env;
        await execAsync(command, { env: { ...env, PATH: searchPath } });
    } catch (error) {
        console.error(`Error opening project in ${vscodeFlavour}:`, error);
        showToast({
            style: Toast.Style.Failure,
            title: "Failed to open project",
            message: `Could not open project in ${vscodeFlavour}`,
        });
    }
};
