import { showToast, Toast } from "@vicinae/api";
import { appendFile, readFile, writeFile } from "fs/promises";

import {
  HYPRLAND_CONFIG_PATH,
  VICINAE_MONITORS_CONFIG_PATH,
  VICINAE_SOURCE_LINE,
} from "../config";
import { fileExists } from "../utils/path";

export async function ensureVicinaeConfigSourced() {
  try {
    const config = await readHyprlandConfig();

    const isSourced = config
      .split("\n")
      .some((line) => line.includes("vicinae-monitors.conf"));

    if (!isSourced) {
      await appendFile(HYPRLAND_CONFIG_PATH, `\n${VICINAE_SOURCE_LINE}\n`);
    }

    const exists = await fileExists(VICINAE_MONITORS_CONFIG_PATH);
    if (!exists) {
      await writeFile(
        VICINAE_MONITORS_CONFIG_PATH,
        "# Vicinae Monitors Configuration\n# This file is managed by the Vicinae Hyprland Monitors extension\n",
        "utf-8"
      );
    }
  } catch (e) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to load Vicinae monitors config",
    });
  }
}

export async function readVicinaeMonitorsConfig() {
  const exists = await fileExists(VICINAE_MONITORS_CONFIG_PATH);
  if (!exists) return "";
  return readFile(VICINAE_MONITORS_CONFIG_PATH, "utf-8");
}

async function readHyprlandConfig() {
  return readFile(HYPRLAND_CONFIG_PATH, "utf-8");
}
