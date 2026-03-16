import { writeFileSync } from "fs";
import { readVicinaeMonitorsConfig } from "./hyprlandConfig";
import { Monitor } from "../hyprland-monitors";
import { VICINAE_MONITORS_CONFIG_PATH } from "../config";
import { showToast, Toast } from "@vicinae/api";
import { execSync } from "child_process";

export const setMonitorPersistRule = (monitor: Monitor) => {
  const config = readVicinaeMonitorsConfig();
  const lines = config.split("\n");
  const prefix = `monitor = ${monitor.name},`;
  const newRule = buildMonitorPersistRule(monitor);

  let found = false;
  const updatedLines = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return newRule;
    }
    return line;
  });

  if (!found) updatedLines.push(newRule);

  writeFileSync(VICINAE_MONITORS_CONFIG_PATH, updatedLines.join("\n"), "utf-8");
};

export const setMonitorRule = (monitor: Monitor) => {
  const rule = buildMonitorRule(monitor);
  console.log(`hyprctl keyword monitor "${rule}"`);
  try {
    execSync(`hyprctl keyword monitor "${rule}"`);
    showToast({
      style: Toast.Style.Success,
      title: "Monitor updated",
    });
  } catch (e) {
    console.log(e);
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to update monitor",
    });
  }
};

export const getMonitors = () => {
  try {
    const hyprctlOutput = JSON.parse(
      execSync("hyprctl -j monitors").toString(),
    ) as HyprctlMonitorsOutput[];

    const config = readVicinaeMonitorsConfig();

    return hyprctlOutput.map((monitor) => {
      const position = getMonitorPosition(monitor.name, config);
      return {
        id: monitor.id,
        description: monitor.description,
        name: monitor.name,
        width: monitor.width,
        height: monitor.height,
        focused: monitor.focused,
        scale: monitor.scale,
        position: position || "auto",
        transform: monitor.transform,
        refreshRate: monitor.refreshRate,
        mode: `${monitor.width}x${
          monitor.height
        }@${monitor.refreshRate.toFixed(2)}Hz`,
        availableModes: monitor.availableModes.reduce((acc, mode) => {
          if (acc.includes(mode)) return acc;
          return [...acc, mode];
        }, [] as string[]),
      };
    });
  } catch (e) {
    console.log(e);
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to fetch monitors",
    });
    return [];
  }
};

export function getMonitorPosition(monitorId: string, config: string) {
  const lines = config.split("\n");
  const prefix = `monitor = ${monitorId},`;
  const line = lines.find((line) => line.startsWith(prefix));
  if (!line) return undefined;
  return line.split(",")[2].trim();
}

export const buildMonitorPersistRule = (monitor: Monitor) => {
  return `monitor = ${monitor.name}, ${monitor.width}x${
    monitor.height
  }@${monitor.refreshRate}, ${monitor.position ?? "auto"}, ${
    monitor.scale
  }, transform, ${monitor.transform}`;
};

export const buildMonitorRule = (monitor: Monitor) => {
  return `${monitor.name}, ${monitor.width}x${
    monitor.height
  }@${monitor.refreshRate}, ${monitor.position ?? "auto"}, ${
    monitor.scale
  }, transform, ${monitor.transform}`;
};

type HyprctlMonitorsOutput = {
  id: number;
  description: string;
  name: string;
  width: number;
  height: number;
  transform: number;
  scale: number;
  focused: boolean;
  refreshRate: number;
  availableModes: string[];
};
