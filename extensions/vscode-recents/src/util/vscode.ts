import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { VSCODE_EXECUTABLES } from "../constants";
import { type Preferences, ProjectType, type RecentProject, type VSCodeFlavour, WindowPreference } from "../types";

const execAsync = promisify(exec);

function getVSCodeExecutable(flavour?: VSCodeFlavour): string {
    const flavourKey = flavour ?? getPreferenceValues<Preferences>().vscodeFlavour;
    const executable = VSCODE_EXECUTABLES[flavourKey];

    if (!executable) {
        throw new Error(`Unknown VSCode flavour: ${flavourKey}`);
    }

    return executable;
}

async function isExecutableAvailable(executable: string): Promise<boolean> {
    try {
        await execAsync(`command -v ${executable}`);
        return true;
    } catch {
        return false;
    }
}

export async function openProjectInVSCode(project: RecentProject, flavour?: VSCodeFlavour): Promise<void> {
    const { windowPreference } = getPreferenceValues<Preferences>();
    const flavourKey = flavour ?? getPreferenceValues<Preferences>().vscodeFlavour;
    const executable = getVSCodeExecutable(flavour);

    try {
        const isAvailable = await isExecutableAvailable(executable);

        if (!isAvailable) {
            showToast({
                title: "Command not found",
                style: Toast.Style.Failure,
                message: `Make sure the '${executable}' command is available in your PATH.`,
            });
            return;
        }

        let command = `${executable}`;

        if (windowPreference === WindowPreference.NewWindow) {
            command += " --new-window";
        } else if (windowPreference === WindowPreference.ReuseWindow) {
            command += " --reuse-window";
        }

        if (project.type === ProjectType.Folder) {
            command += ` --folder-uri "${project.path}"`;
        } else {
            command += ` --file-uri "${project.path}"`;
        }

        const { NODE_ENV: _NODE_ENV, ...env } = process.env;
        await execAsync(`${command}`, { env });
    } catch (error) {
        console.error(`Error opening project in ${flavourKey}:`, error);
        showToast({
            style: Toast.Style.Failure,
            title: "Failed to open project",
            message: `Could not open project in ${flavourKey}`,
        });
    }
}
