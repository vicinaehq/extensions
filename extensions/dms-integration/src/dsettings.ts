import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Opens the DMS settings panel by delegating to the DMS IPC command. */
export default async function launchSettings() {
  const toast = await showToast(Toast.Style.Animated, "Opening settings...");

  try {
    await execFileAsync("dms", ["ipc", "settings", "focusOrToggle"]);
    toast.style = Toast.Style.Success;
    toast.title = "Settings opened";
    await closeMainWindow();
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to open settings";
    console.error("Error opening settings:", error);
  }
}
