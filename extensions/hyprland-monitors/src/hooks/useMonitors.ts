import { showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { Monitor } from "../hyprland-monitors";
import {
  readVicinaeMonitorsConfig,
  ensureVicinaeConfigSourced,
} from "../api/hyprlandConfig";
import { execAsync } from "../utils/execAsync";
import { getMonitorRule, buildMonitorRule } from "../api/monitor";

export const useMonitors = () => {
  const [monitors, setMonitors] = useState<Monitor[]>([]);

  const fetchMonitors = async () => {
    try {
      const { stdout } = await execAsync("hyprctl -j monitors");
      const hyprctlOutput = JSON.parse(stdout) as HyprctlMonitorsOutput[];
      const config = await readVicinaeMonitorsConfig();
      const monitors = hyprctlOutput.map((monitor) => {
        const monitorRule = getMonitorRule(monitor.description, config);
        return {
          id: monitor.id,
          description: monitor.description,
          name: monitor.name,
          width: monitor.width,
          height: monitor.height,
          scale: monitor.scale,
          position: monitorRule?.split(",")[2].trim() || "auto",
          transform: monitor.transform,
          refreshRate: monitor.refreshRate,
          mode: `${monitor.width}x${
            monitor.height
          }@${monitor.refreshRate.toFixed(2)}Hz`,
          availableModes: monitor.availableModes,
        };
      });
      setMonitors(monitors);
    } catch (e) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch monitors",
      });
      setMonitors([]);
    }
  };

  useEffect(() => {
    fetchMonitors();
    ensureVicinaeConfigSourced();
  }, []);

  return { monitors, refetchMonitors: fetchMonitors };
};

type HyprctlMonitorsOutput = {
  id: number;
  description: string;
  name: string;
  width: number;
  height: number;
  transform: number;
  scale: number;
  refreshRate: number;
  availableModes: string[];
};
