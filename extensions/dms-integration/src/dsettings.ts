import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Opens Dux settings, optionally at a specific sidebar category. */
export async function openSettings(category?: string) {
  const toast = await showToast(Toast.Style.Animated, "Opening settings...");

  try {
    const { stdout } = await execFileAsync(
      "dms",
      [
        "ipc",
        "call",
        "settings",
        ...(category ? ["openWith", category] : ["focusOrToggle"]),
      ],
      { timeout: 10_000 },
    );
    if (/FAILED|ERROR/i.test(stdout)) throw new Error(stdout.trim());
    toast.style = Toast.Style.Success;
    toast.title = "Settings opened";
    await closeMainWindow();
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to open settings";
    toast.message = error instanceof Error ? error.message : String(error);
    console.error("Error opening settings:", error);
  }
}

export default async function launchSettings() {
  await openSettings();
}
