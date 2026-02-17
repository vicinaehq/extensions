import { showToast, Toast } from "@vicinae/api";
import { appendFileSync, readFileSync, writeFileSync } from "fs";

import {
  HYPRLAND_CONFIG_PATH,
  VICINAE_MONITORS_CONFIG_PATH,
  VICINAE_SOURCE_LINE,
} from "../config";
import { fileExists } from "../utils/path";

export const setupPersistConfig = () => {
  writeFileSync(
    VICINAE_MONITORS_CONFIG_PATH,
    "# Vicinae Monitors Configuration\n# This file is managed by the Vicinae Hyprland Monitors extension\n",
    "utf-8",
  );

  appendFileSync(HYPRLAND_CONFIG_PATH, `\n${VICINAE_SOURCE_LINE}\n`);
};

export function getIsPersistSetup() {
  const config = readHyprlandConfig();
  const isSourced = config
    .split("\n")
    .some((line) => line.includes("vicinae-monitors.conf"));
  const vicinaeConfigExists = readVicinaeMonitorsConfig();
  return isSourced && !!vicinaeConfigExists;
}

export function readVicinaeMonitorsConfig() {
  try {
    const exists = fileExists(VICINAE_MONITORS_CONFIG_PATH);
    if (!exists) return "";
    return readFileSync(VICINAE_MONITORS_CONFIG_PATH, "utf-8");
  } catch (e) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to read Vicinae monitors config",
    });
    return "";
  }
}

function readHyprlandConfig() {
  try {
    return readFileSync(HYPRLAND_CONFIG_PATH, "utf-8");
  } catch (e) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to read Hyprland config",
    });
    return "";
  }
}
