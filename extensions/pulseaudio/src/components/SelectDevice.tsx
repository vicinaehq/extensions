import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { pactl, PactlDevice, PactlStream } from "../pactl";
import { useAudioState } from "../hooks/useAudioState";
import { showErrorToast } from "../ui/toasts";
import { displayNameForDevice } from "../utils/displayNameForDevice";

export function SelectDevice(props: {
  stream: PactlStream;
  onOutputChange: () => Promise<void>;
  kind: "sink" | "source";
}) {
  const { stream, onOutputChange } = props;
  const { audio, isLoading } = useAudioState();
  const { pop } = useNavigation();
  const devices =
    props.kind === "sink" ? (audio?.sinks ?? []) : (audio?.sources ?? []);

  async function selectDevice(device: PactlDevice) {
    try {
      await pactl.setDeviceForStream(stream.index, device.name, props.kind);
      await onOutputChange();
      pop();
    } catch (e) {
      await showErrorToast({ title: "Failed to move stream", error: e });
    }
  }

  const typeLabel = props.kind === "sink" ? "Output" : "Input";
  const icon = props.kind === "sink" ? Icon.SpeakerHigh : Icon.Microphone;

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Select ${typeLabel} Device`}
      searchBarPlaceholder={`Search ${typeLabel.toLowerCase()} devices…`}
    >
      {devices.map((device) => {
        const title = displayNameForDevice(device);
        const isCurrent = device.index === stream[props.kind];
        return (
          <List.Item
            key={device.name}
            title={title}
            icon={icon}
            accessories={
              isCurrent
                ? [
                    {
                      icon: Icon.Checkmark,
                      tag: {
                        color: "green",
                        value: "Current",
                      },
                    },
                  ]
                : []
            }
            actions={
              <ActionPanel>
                <Action
                  title={`Select ${typeLabel}`}
                  icon={icon}
                  onAction={() => selectDevice(device)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
