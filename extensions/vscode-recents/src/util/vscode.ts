import { promisify } from "util";
import { exec } from "child_process";
import { Preferences } from "../types";
import { VSCODE_EXECUTABLES } from "../constants";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";

const execAsync = promisify(exec);

function getVSCodeExecutable(): string {
    const { vscodeFlavour } = getPreferenceValues<Preferences>();
    const executable = VSCODE_EXECUTABLES[vscodeFlavour];

    if (!executable) {
        throw new Error(`Unknown VSCode flavour: ${vscodeFlavour}`);
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

export async function openProjectInVSCode(projectPath: string): Promise<void> {
    const { vscodeFlavour } = getPreferenceValues<Preferences>();
    const executable = getVSCodeExecutable();

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

        await execAsync(`${executable} --new-window "${projectPath}"`);
    } catch (error) {
        console.error(`Error opening project in ${vscodeFlavour}:`, error);
        showToast({
            style: Toast.Style.Failure,
            title: "Failed to open project",
            message: `Could not open project in ${vscodeFlavour}`,
        });
    }
}
