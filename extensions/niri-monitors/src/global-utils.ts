import { showToast, Toast } from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "util";
import { Output } from "./types";

export const execAsync = promisify(exec);

export async function isNiriRunning(): Promise<boolean> {
  try {
    await execAsync("niri msg version");
    return true;
  } catch {
    return false;
  }
}

export async function runNiriCommand(command: string): Promise<boolean> {
  try {
    await execAsync(`niri msg ${command}`);
    return true;
  } catch (error) {
    handleError("Command failed", error);
    return false;
  }
}

export async function fetchNiriOutputs(): Promise<Record<string, Output>> {
  try {
    const { stdout } = await execAsync(`niri msg --json outputs`);
    return JSON.parse(stdout);
  } catch (error) {
    handleError("Failed to fetch  niri ouptuts:", error);
    return {};
  }
}

export async function runNiriAction(action: string): Promise<boolean> {
  try {
    await execAsync(`niri msg action ${action}`);
    return true;
  } catch (error) {
    handleError("Action failed", error);
    return false;
  }
}

export function showSuccess(title: string, message?: string) {
  showToast({
    style: Toast.Style.Success,
    title,
    ...(message && { message }),
  });
}
export function handleError(title: string, error: unknown) {
  showToast({
    style: Toast.Style.Failure,
    title,
    message: error instanceof Error ? error.message : "Unknown error",
  });
}

export function formatRefreshRate(refreshRate: number): string {
  const hz = refreshRate / 1000;
  return Number.isInteger(hz) ? `${hz}` : `${parseFloat(hz.toFixed(3))}`;
}

export function formatMode(mode: {
  width: number;
  height: number;
  refresh_rate: number;
}): string {
  return `${mode.width}x${mode.height}@${formatRefreshRate(mode.refresh_rate)}`;
}

/**
 * `niri msg --json outputs` reports transforms as "Normal", "90", "Flipped",
 * "Flipped90", etc. niri's config file (and CLI) expects lowercase,
 * dash-separated values instead: "normal", "90", "flipped", "flipped-90".
 * This converts the former into the latter so it matches TRANSFORMS.
 */
export function normalizeTransform(transform: string): string {
  return transform.toLowerCase().replace(/^flipped(\d+)$/, "flipped-$1");
}
