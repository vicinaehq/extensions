import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { COMMON_SCALES, Output, TRANSFORMS } from "./types";
import {
  fetchNiriOutputs,
  formatMode,
  formatRefreshRate,
  isNiriRunning,
  runNiriAction,
  runNiriCommand,
  showSuccess,
} from "./global-utils";
import PersistMonitorConfig from "./persist-monitor-config";
import NiriNotFound from "./niri-not-found";

export default function ManageMonitors() {
  const [outputs, setOutputs] = useState<Record<string, Output>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [isNiriActive, setIsNiriActive] = useState<boolean>(true);

  const loadOutputs = async () => {
    setLoading(true);
    const active = await isNiriRunning();
    if (!active) {
      setIsNiriActive(false);
      setLoading(false);
      return;
    }
    setIsNiriActive(true);
    const data = await fetchNiriOutputs();
    setOutputs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadOutputs();
  }, []);

  const outputList = Object.values(outputs);
  const enabledCount = outputList.filter((o) => o.logical !== null).length;

  const handleToggleMonitor = async (
    outputName: string,
    currentlyEnabled: boolean,
  ) => {
    const action = currentlyEnabled ? "off" : "on";
    const success = await runNiriCommand(`output ${outputName} ${action}`);
    if (success) {
      showSuccess(`Monitor ${outputName} turned ${action}`);
      await loadOutputs();
    }
  };

  const handleSetScale = async (outputName: string, scale: number) => {
    const success = await runNiriCommand(`output ${outputName} scale ${scale}`);
    if (success) {
      showSuccess(`Scale for ${outputName} set to ${scale}x`);
      await loadOutputs();
    }
  };

  const handleSetTransform = async (outputName: string, transform: string) => {
    const success = await runNiriCommand(
      `output ${outputName} transform ${transform}`,
    );
    if (success) {
      showSuccess(`Rotation for ${outputName} updated`);
      await loadOutputs();
    }
  };

  const handleSetResolution = async (
    outputName: string,
    resolution: string,
  ) => {
    const success = await runNiriCommand(
      `output ${outputName} mode ${resolution}`,
    );
    if (success) {
      showSuccess(`Resolution for ${outputName} updated`);
      await loadOutputs();
    }
  };

  const handlePowerOffAll = async () => {
    const success = await runNiriAction("power-off-monitors");
    if (success) {
      showSuccess("Powered off all monitors");
    }
  };

  if (!loading && !isNiriActive) {
    return <NiriNotFound onRefresh={loadOutputs} />;
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search connected monitors..."
    >
      {outputList.length === 0 || loading ? (
        <List.EmptyView
          icon={Icon.Monitor}
          title="No Monitors Found"
          description="Could not detect active Niri monitor outputs."
        />
      ) : (
        outputList.map((monitor) => {
          const isEnabled = monitor.logical !== null;

          const currentMode = monitor.modes[monitor.current_mode];

          const monitorResolution = currentMode
            ? `${currentMode.width}x${currentMode.height}`
            : "unknown";

          const monitorRefreshRate = currentMode
            ? `${formatRefreshRate(currentMode.refresh_rate)}Hz`
            : "";

          const monitorScale = monitor.logical
            ? monitor.logical.scale
            : "Disabled";

          const monitorTransform = monitor.logical
            ? monitor.logical.transform
            : "off";

          return (
            <List.Item
              key={monitor.name}
              title={monitor.name}
              icon={isEnabled ? Icon.Monitor : Icon.EyeDisabled}
              subtitle={`${monitor.make} ${isEnabled ? `- ${monitorResolution}@${monitorRefreshRate}` : ""}`}
              accessories={
                isEnabled
                  ? [
                      {
                        tooltip: "Rotation",
                        tag: `${monitorTransform}${monitorTransform === "Normal" || monitorTransform === "Flipped" ? "" : "°"}`,
                        icon: Icon.RotateClockwise,
                      },
                      {
                        tooltip: "Scale",
                        tag: `${monitorScale}x`,
                        icon: Icon.MagnifyingGlass,
                      },
                    ]
                  : [{ text: "Disabled", icon: Icon.XMarkCircle }]
              }
              actions={
                <ActionPanel>
                  {/* Update Niri Monitor Configuration */}
                  <Action.Push
                    title="Edit Persistent Settings"
                    icon={Icon.Cog}
                    target={
                      <PersistMonitorConfig
                        monitor={monitor}
                        onRefresh={loadOutputs}
                        enabledCount={enabledCount}
                      />
                    }
                  />

                  {/* Quick Actions Section */}
                  <ActionPanel.Section title="Quick Actions">
                    {(!isEnabled || enabledCount > 1) && (
                      <Action
                        title={isEnabled ? "Disable Monitor" : "Enable Monitor"}
                        icon={isEnabled ? Icon.EyeDisabled : Icon.Eye}
                        shortcut={{ modifiers: ["cmd"], key: "d" }}
                        onAction={() =>
                          handleToggleMonitor(monitor.name, isEnabled)
                        }
                      />
                    )}

                    {isEnabled && (
                      <>
                        <ActionPanel.Submenu
                          title="Set Scale"
                          icon={Icon.Ruler}
                          shortcut={{ modifiers: ["cmd"], key: "s" }}
                        >
                          {COMMON_SCALES.map((scale) => (
                            <Action
                              key={scale}
                              title={`${scale}x`}
                              onAction={() =>
                                handleSetScale(monitor.name, scale)
                              }
                            />
                          ))}
                        </ActionPanel.Submenu>
                        <ActionPanel.Submenu
                          title="Rotate Display"
                          icon={Icon.ArrowClockwise}
                          shortcut={{ modifiers: ["cmd"], key: "r" }}
                        >
                          {TRANSFORMS.map((t) => (
                            <Action
                              key={t.value}
                              title={t.label}
                              onAction={() =>
                                handleSetTransform(monitor.name, t.value)
                              }
                            />
                          ))}
                        </ActionPanel.Submenu>
                        <ActionPanel.Submenu
                          title="Set Resolution"
                          icon={Icon.Monitor}
                          shortcut={{ modifiers: ["shift"], key: "r" }}
                        >
                          {monitor.modes.map((mode, index) => {
                            const res = formatMode(mode);

                            return (
                              <Action
                                key={index}
                                title={`${res}Hz${mode.is_preferred ? " (Preferred)" : ""}`}
                                onAction={() =>
                                  handleSetResolution(monitor.name, res)
                                }
                              />
                            );
                          })}
                        </ActionPanel.Submenu>
                      </>
                    )}
                  </ActionPanel.Section>

                  {/* Global Actions Section*/}
                  <ActionPanel.Section title="Global Actions">
                    <Action
                      title="Refresh List"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                      onAction={loadOutputs}
                    />
                    <Action
                      title="Power Off All Monitors"
                      icon={Icon.Power}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                      onAction={handlePowerOffAll}
                    />
                  </ActionPanel.Section>

                  {/* Copy Information Section */}
                  <ActionPanel.Section title="Copy Information">
                    <Action.CopyToClipboard
                      title="Copy Monitor Name"
                      content={monitor.name}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                    <Action.CopyToClipboard
                      title="Copy Model"
                      content={`${monitor.make} ${monitor.model}`}
                      shortcut={{ modifiers: ["shift"], key: "c" }}
                    />
                    {isEnabled && (
                      <Action.CopyToClipboard
                        title="Copy Resolution"
                        content={`${monitorResolution}@${monitorRefreshRate}`}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                      />
                    )}
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
