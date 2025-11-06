import { exec } from "child_process";
import { promisify } from "util";
import { showToast, closeMainWindow } from "@vicinae/api";

const execAsync = promisify(exec);

export async function openKCMModule(
  moduleName: string,
  command: string
): Promise<void> {
  try {
    await showToast({
      title: `Opening ${moduleName}...`,
      message: "Launching KDE System Settings",
    });

    // launch in background, detach from terminal, and discard output
    await execAsync(`nohup ${command} > /dev/null 2>&1 &`, { timeout: 5000 });

    await showToast({
      title: "Success",
      message: `${moduleName} opened successfully`,
    });

    await closeMainWindow();
  } catch (error) {
    await showToast({
      title: "Error",
      message: `Failed to open ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
