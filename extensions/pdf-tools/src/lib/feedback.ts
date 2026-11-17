import { closeMainWindow, showHUD, showToast, Toast } from "@vicinae/api";

/**
 * Toasts are only visible while the Vicinae window is open. The window is closed before
 * files are read from the clipboard or picked in a dialog, so from then on progress,
 * results and errors are reported with a HUD instead.
 */
let mainWindowClosed = false;

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
  await showHUD(message ? `${title}: ${message}` : title);
}

export async function showFailure(title: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  if (mainWindowClosed) {
    // A HUD only fits one short line: show the reason, the user knows which command failed
    await showHUD(message);
  } else {
    await showToast({ style: Toast.Style.Failure, title, message });
  }
}
