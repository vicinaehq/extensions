import { List, Icon, ActionPanel, Action } from "@vicinae/api";
import { useNiriObjectData } from "./hooks";
import type { Output } from "./types";
import { NiriList } from "./components/NiriList";
import { runNiriCommand, runNiriAction, showSuccess } from "./utils";

export default function Outputs() {
  const [outputs, loading, handleRefresh] = useNiriObjectData<Output>(
    "niri msg --json outputs",
    "Failed to get outputs",
  );

  const setOutputScale = async (outputName: string, scale: number) => {
    const success = await runNiriCommand(`output ${outputName} scale ${scale}`);
    if (success) {
      showSuccess(`Scale set to ${scale}x`);
      await handleRefresh();
    }
  };

  const toggleVRR = async (outputName: string, enable: boolean) => {
    const action = enable ? "on" : "off";
    const success = await runNiriCommand(`output ${outputName} vrr ${action}`);
    if (success) {
      showSuccess(`VRR ${enable ? "enabled" : "disabled"}`);
      await handleRefresh();
    }
  };

  const focusMonitor = async (outputName: string) => {
    const success = await runNiriAction(`focus-monitor ${outputName}`);
    if (success) {
      showSuccess(`Focused monitor ${outputName}`);
    }
  };

  return (
    <NiriList
      loading={loading}
      emptyTitle="No Outputs Found"
      emptyDescription="No output devices are currently connected."
      emptyIcon={Icon.Monitor}
    >
      {Object.values(outputs).map((output) => {
        const currentMode = output.modes[output.current_mode];
        const resolution = currentMode
          ? `${currentMode.width}×${currentMode.height}`
          : "Unknown";
        const refreshRate = currentMode
          ? `${(currentMode.refresh_rate / 1000).toFixed(1)}Hz`
          : "Unknown";

        return (
          <List.Item
            key={output.name}
            title={output.name}
            subtitle={`${output.make} ${output.model} • ${resolution} @ ${refreshRate}`}
            icon={Icon.Monitor}
            accessories={[
              output.vrr_supported
                ? { text: `VRR ${output.vrr_enabled ? "On" : "Off"}`, icon: Icon.Gear }
                : {},
              { text: `Scale: ${output.logical.scale}x`, icon: Icon.Window },
            ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Focus Monitor"
                    icon={Icon.Eye}
                    onAction={() => focusMonitor(output.name)}
                  />
                  {output.vrr_supported && (
                    <Action
                      title={`VRR ${output.vrr_enabled ? "Off" : "On"}`}
                      icon={Icon.Gear}
                      onAction={() => toggleVRR(output.name, !output.vrr_enabled)}
                    />
                  )}
                <Action
                  title="Set Scale to 1x"
                  icon={Icon.Window}
                  onAction={() => setOutputScale(output.name, 1)}
                />
                <Action
                  title="Set Scale to 1.5x"
                  icon={Icon.Window}
                  onAction={() => setOutputScale(output.name, 1.5)}
                />
                <Action
                  title="Set Scale to 1.75x"
                  icon={Icon.Window}
                  onAction={() => setOutputScale(output.name, 1.75)}
                />
                <Action
                  title="Set Scale to 2x"
                  icon={Icon.Window}
                  onAction={() => setOutputScale(output.name, 2)}
                />
                <Action.CopyToClipboard
                  title="Copy Output Name"
                  content={output.name}
                />
                <Action.CopyToClipboard
                  title="Copy Model"
                  content={`${output.make} ${output.model}`}
                />
                <Action.CopyToClipboard
                  title="Copy Serial"
                  content={output.serial}
                />
                <Action.CopyToClipboard
                  title="Copy Resolution"
                  content={resolution}
                />
                <Action.CopyToClipboard
                  title="Copy Physical Size"
                  content={`${output.physical_size[0]}×${output.physical_size[1]}mm`}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </NiriList>
  );
}
