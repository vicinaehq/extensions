import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { environment } from "@vicinae/api";
import type { Color } from "../lib/types";

const execFileAsync = promisify(execFile);

export async function pickScreenColor(): Promise<Color | null> {
  const platform = process.platform;

  let assetsPath = "";
  try {
    assetsPath = environment.assetsPath || "";
  } catch {
    // fallback
  }

  const candidateDirs = [
    path.join(__dirname, "assets", "bin"),
    assetsPath ? path.join(assetsPath, "bin") : "",
    path.join(__dirname, "bin"),
  ].filter(Boolean);

  if (platform !== "linux") {
    throw new Error(`Color picking is currently only supported on Linux (current platform: ${platform})`);
  }

  const candidate = candidateDirs
    .map((dir) => path.join(dir, "picker-linux.py"))
    .find((p) => existsSync(p));

  if (!candidate) {
    throw new Error("Linux picker script picker-linux.py not found in candidate paths: " + candidateDirs.join(", "));
  }

  const binaryPath = "python3";
  const args = [candidate];

  try {
    const { stdout } = await execFileAsync(binaryPath, args, {
      timeout: 120000,
    });

    const trimmed = stdout.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = JSON.parse(trimmed) as Color;
    return parsed;
  } catch (err: any) {
    if (err.code === 1 || err.exitCode === 1) {
      // User cancelled
      return null;
    }
    console.error("Error executing color picker:", err);
    throw err;
  }
}
