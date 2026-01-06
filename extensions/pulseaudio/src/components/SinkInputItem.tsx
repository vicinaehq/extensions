import { Action, ActionPanel, Icon, Keyboard, List } from "@vicinae/api";
import {
  appNameForStream,
  pactl,
  percentFromVolume,
  type PactlSinkInput,
} from "../pactl";
import { PlaybackDetail } from "./PlaybackDetail";
import { SelectOutputSink } from "./SelectOutputSink";
import { SetVolumeForm } from "./SetVolumeForm";
import { speakerIconForPercentAndMute } from "../ui/audioIcons";
import { deviceAccessories } from "../ui/deviceAccessories";
import { clamp } from "../ui/format";
import { showErrorToast } from "../ui/toasts";

export function SinkInputItem(props: {
  sinkInput: PactlSinkInput;
  refresh: () => Promise<void>;
  refreshShortcut: Keyboard.Shortcut | Keyboard.Shortcut.Common;
  sinkName?: string;
}) {
  const { sinkInput, refresh, refreshShortcut, sinkName } = props;

  const vol = percentFromVolume(sinkInput.volume);
  const icon = speakerIconForPercentAndMute(vol, sinkInput.mute);
  const title = appNameForStream(sinkInput);

  async function toggleMute(): Promise<void> {
    try {
      await pactl.setSinkInputMute(sinkInput.index, "toggle");
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to toggle mute", error: e });
    }
  }

  async function setVolume(next: number): Promise<void> {
    try {
      const safe = clamp(next, 0, 150);
      await pactl.setSinkInputVolume(sinkInput.index, safe);
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to change volume", error: e });
    }
  }

  const actions = (
    <ActionPanel title={title}>
      <ActionPanel.Section title="Output">
        <Action.Push
          title="Select Output Device"
          icon={Icon.SpeakerHigh}
          target={<SelectOutputSink sinkInput={sinkInput} onOutputChange={refresh} />}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Stream">
        <Action
          title={sinkInput.mute ? "Unmute Stream" : "Mute Stream"}
          icon={sinkInput.mute ? Icon.SpeakerOn : Icon.SpeakerOff}
          onAction={toggleMute}
        />
        <Action.CopyToClipboard title="Copy Stream Name" content={title} />
      </ActionPanel.Section>
      <ActionPanel.Section title="Volume">
        <Action
          title="Increase Volume (+5%)"
          icon={Icon.SpeakerUp}
          onAction={() => setVolume((vol ?? 0) + 5)}
        />
        <Action
          title="Decrease Volume (-5%)"
          icon={Icon.SpeakerDown}
          onAction={() => setVolume((vol ?? 0) - 5)}
        />
        <Action.Push
          title="Set Volume…"
          icon={Icon.Gauge}
          target={
            <SetVolumeForm
              kind="sink-input"
              deviceIndex={sinkInput.index}
              deviceTitle={title}
              currentPercent={vol}
              onDone={refresh}
            />
          }
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Other">
        <Action
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={refreshShortcut}
          onAction={refresh}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List.Item
      title={title}
      icon={icon}
      accessories={deviceAccessories({
        isDefault: false,
        muted: sinkInput.mute,
        volumePercent: vol,
      })}
      detail={
        <PlaybackDetail
          sinkInput={sinkInput}
          volumePercent={vol}
          sinkName={sinkName}
        />
      }
      actions={actions}
      keywords={[
        sinkInput.name,
        sinkName ?? "",
        sinkInput.properties?.["application.name"] ?? "",
      ]}
    />
  );
}
