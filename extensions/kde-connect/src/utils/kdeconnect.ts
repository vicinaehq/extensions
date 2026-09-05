import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  PopToRootType,
  Toast,
  closeMainWindow,
  popToRoot,
  showToast,
} from "@vicinae/api";

const execFileAsync = promisify(execFile);

export class KdeConnectNotFoundError extends Error {
  constructor(
    message = "kdeconnect-cli is not installed or not found in PATH. Please install KDE Connect.",
  ) {
    super(message);
    this.name = "KdeConnectNotFoundError";
  }
}

export function isKdeConnectNotFoundError(error: unknown): boolean {
  if (error instanceof KdeConnectNotFoundError) {
    return true;
  }
  if (error instanceof Error) {
    const err = error as NodeJS.ErrnoException;
    return (
      err.code === "ENOENT" ||
      error.message.includes("ENOENT") ||
      error.message.includes("kdeconnect-cli is not installed") ||
      error.message.includes("kdeconnect-cli not found")
    );
  }
  return false;
}

export async function showKdeError(
  error: unknown,
  fallbackTitle = "KDE Connect Error",
): Promise<void> {
  if (isKdeConnectNotFoundError(error)) {
    await showToast({
      style: Toast.Style.Failure,
      title: "kdeconnect-cli not found",
      message: "Install KDE Connect",
    });
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: fallbackTitle,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Executes kdeconnect-cli with the provided arguments, classifying errors
 * (such as the executable not being installed or found in PATH).
 */
async function runKdeConnect(
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("kdeconnect-cli", args);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      throw new KdeConnectNotFoundError();
    }
    throw error;
  }
}

/**
 * Resets navigation stack to root and closes the Vicinae window immediately.
 * Ensures that reopening Vicinae lands cleanly on the search screen rather than
 * restoring a suspended command view.
 */
export async function finishAndClose(): Promise<void> {
  try {
    await popToRoot({ clearSearchBar: true });
  } catch {
    // Ignore any error if already at root
  }
  await closeMainWindow({
    popToRootType: PopToRootType.Immediate,
    clearRootSearch: true,
  });
}

export interface KdeDevice {
  id: string;
  name: string;
}

/**
 * Fetches the list of reachable paired devices using `kdeconnect-cli -a`.
 * Strictly filters only devices that are confirmed to be BOTH paired AND reachable.
 */
export async function getAvailableDevices(): Promise<KdeDevice[]> {
  const { stdout } = await runKdeConnect(["-a"]);
  const lines = stdout.split("\n");
  const devices: KdeDevice[] = [];
  const regex =
    /^-\s+(.+?):\s+([a-zA-Z0-9_-]+)(?:\s+.*)?\s+\(paired and reachable\)$/;

  for (const line of lines) {
    const match = regex.exec(line.trim());
    if (match) {
      devices.push({
        name: match[1].trim(),
        id: match[2].trim(),
      });
    }
  }

  return devices;
}

/**
 * Sends one or multiple files to a device using `kdeconnect-cli -d <device> --share <file>`.
 */
export async function sendFiles(
  deviceId: string,
  filePaths: string[],
  onProgress?: (current: number, total: number, currentFile: string) => void,
): Promise<void> {
  if (!filePaths || filePaths.length === 0) {
    throw new Error("No files selected to send.");
  }

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    onProgress?.(i + 1, filePaths.length, filePath);
    await runKdeConnect(["-d", deviceId, "--share", filePath]);
  }
}
export const shareFiles = sendFiles;

/**
 * Sends text directly to a device using `kdeconnect-cli -d <device> --share-text <text>`.
 */
export async function sendText(deviceId: string, text: string): Promise<void> {
  if (!text || !text.trim()) {
    throw new Error("Text cannot be empty.");
  }
  await runKdeConnect(["-d", deviceId, "--share-text", text.trim()]);
}
export const shareText = sendText;

/**
 * Sends the current clipboard content to the device.
 */
export async function sendClipboard(deviceId?: string): Promise<void> {
  const args = deviceId
    ? ["-d", deviceId, "--send-clipboard"]
    : ["--send-clipboard"];
  await runKdeConnect(args);
}

/**
 * Rings the device to help find it.
 */
export async function ringPhone(deviceId?: string): Promise<void> {
  const args = deviceId ? ["-d", deviceId, "--ring"] : ["--ring"];
  await runKdeConnect(args);
}

/**
 * Sends an SMS message to a destination phone number.
 */
export async function sendMessage(
  deviceId: string,
  destination: string,
  message: string,
): Promise<void> {
  if (!destination.trim()) {
    throw new Error("Phone number is required.");
  }
  if (!message.trim()) {
    throw new Error("Message text is required.");
  }

  await runKdeConnect([
    "-d",
    deviceId,
    "--destination",
    destination.trim(),
    "--send-sms",
    message.trim(),
  ]);
}
