import * as path from "node:path";
import { closeMainWindow, showHUD, showToast, Toast } from "@vicinae/api";

/**
 * Toasts are only visible while the Vicinae window is open. The window is closed before
 * files are read from the clipboard or picked in a dialog, so from then on progress,
 * results and errors are reported with a HUD instead.
 */
let mainWindowClosed = false;

/**
 * Selected/copied files that were skipped because they are not of a supported type.
 */
let ignoredFiles: string[] = [];

export function reportIgnoredFiles(files: string[]): void {
  ignoredFiles = files;
}

// Put first, so it stays visible in a HUD that only shows one short line
function withIgnoredFiles(message: string): string {
  if (ignoredFiles.length === 0) return message;
  const names = ignoredFiles.map((file) => path.basename(file)).join(", ");
  return `Ignored ${names}. ${message}`;
}

export async function hideMainWindow(): Promise<void> {
  if (mainWindowClosed) return;
  await closeMainWindow();
  mainWindowClosed = true;
}

export async function showProgress(title: string): Promise<void> {
  await hideMainWindow();
  await showHUD(title);
}

export async function showSuccess(title: string, message?: string): Promise<void> {
  await showHUD(withIgnoredFiles(message ? `${title}: ${message}` : title));
}

export async function showFailure(title: string, error: unknown): Promise<void> {
  const message = withIgnoredFiles(error instanceof Error ? error.message : String(error));
  if (mainWindowClosed) {
    // A HUD only fits one short line: show the reason, the user knows which command failed
    await showHUD(message);
  } else {
    await showToast({ style: Toast.Style.Failure, title, message });
  }
}
