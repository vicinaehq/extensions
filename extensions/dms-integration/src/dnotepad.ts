import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Toggles the DMS notepad via IPC */
export default async function launchSettings() {
  const toast = await showToast(Toast.Style.Animated, "Opening notes...");

  try {
    await execFileAsync("dms", ["ipc", "notepad", "toggle"]);
    toast.style = Toast.Style.Success;
    toast.title = "Notepad opened";
    await closeMainWindow();
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to open notepad";
    console.error("Error opening notepad:", error);
  }
}
