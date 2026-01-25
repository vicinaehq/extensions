import { writeFile } from "fs/promises";
import {
  ensureVicinaeConfigSourced,
  readVicinaeMonitorsConfig,
} from "./hyprlandConfig";
import { Monitor } from "../hyprland-monitors";
import { VICINAE_MONITORS_CONFIG_PATH } from "../config";

export async function setMonitorRule(monitor: Monitor) {
  await ensureVicinaeConfigSourced();
  const config = await readVicinaeMonitorsConfig();
  const lines = config.split("\n");
  const prefix = `monitor = desc:${monitor.description},`;
  const newRule = buildMonitorRule(monitor);

  let found = false;
  const updatedLines = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return newRule;
    }
    return line;
  });

  if (!found) updatedLines.push(newRule);

  await writeFile(
    VICINAE_MONITORS_CONFIG_PATH,
    updatedLines.join("\n"),
    "utf-8"
  );
}

export function getMonitorRule(monitorDescription: string, config: string) {
  const lines = config.split("\n");
  const prefix = `monitor = desc:${monitorDescription},`;
  return lines.find((line) => line.startsWith(prefix));
}

export const buildMonitorRule = (monitor: Monitor) => {
  return `monitor = desc:${monitor.description}, ${monitor.width}x${
    monitor.height
  }@${monitor.refreshRate}, ${monitor.position ?? "auto"}, ${
    monitor.scale
  }, transform, ${monitor.transform}`;
};
