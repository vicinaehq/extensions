import { type ExecResult } from "./execute-command";
import { executeIwctlCommandSilent } from "./execute-iwctl";

/**
 * Get the name of the Wi-Fi device from iwctl
 */
export async function getDevice(): Promise<ExecResult> {
  let deviceName: string | null = null;
  const devicesResult = await executeIwctlCommandSilent("device list");

  if (!devicesResult.success) {
    return devicesResult;
  }

  const lines = devicesResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Make sure there are enough lines
  if (lines.length > 4) {
    const parts = lines[4].split(/\s+/);
    if (parts.length > 1) {
      deviceName = parts[1] ?? null;
    }
  }

  if (!deviceName) {
    return {
      success: false,
      stdout: "",
      stderr: "No Wi-Fi device found",
      error: "No Wi-Fi device found",
    };
  }

  return {
    success: true,
    stdout: deviceName,
    stderr: "",
    error: "",
  };
}