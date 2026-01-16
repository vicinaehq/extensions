import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import {
  displayNameForDevice,
  pactl,
  type PactlSink,
  type PactlSinkInput,
} from "../pactl";
import { useAudioState } from "../hooks/useAudioState";
import { showErrorToast } from "../ui/toasts";

export function SelectOutputSink(props: {
  sinkInput: PactlSinkInput;
  onOutputChange: () => Promise<void>;
}) {
  const { sinkInput, onOutputChange } = props;
  const { audio, isLoading } = useAudioState();
  const { pop } = useNavigation();
  const sinks = audio?.sinks ?? [];

  async function selectSink(sink: PactlSink) {
    try {
      await pactl.moveSinkInputToSink(sinkInput.index, sink.name);
      await onOutputChange();
      pop();
    } catch (e) {
      await showErrorToast({ title: "Failed to move stream", error: e });
    }
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Select Output Device"
      searchBarPlaceholder="Search output devices…"
    >
      {sinks.map((sink) => {
        const title = displayNameForDevice(sink);
        const isCurrent = sink.index === sinkInput.sink;
        return (
          <List.Item
            key={sink.name}
            title={title}
            icon={Icon.SpeakerHigh}
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
                  title="Select Output"
                  icon={Icon.SpeakerHigh}
                  onAction={() => selectSink(sink)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
