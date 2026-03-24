import { Action, ActionPanel, Icon, Keyboard, List } from "@vicinae/api";
import { useAudioState } from "../hooks/useAudioState";
import { pactl, PactlStream } from "../pactl";
import { detailsShortcut } from "../shortcuts";
import { micIconForMute, speakerIconForPercentAndMute } from "../ui/audioIcons";
import { deviceAccessories } from "../ui/deviceAccessories";
import { clamp } from "../ui/format";
import { showErrorToast } from "../ui/toasts";
import { percentFromVolume } from "../utils/percentFromVolume";
import { SetVolumeForm } from "./SetVolumeForm";
import { appNameForStream } from "../utils/appNameForStream";
import { SelectDevice } from "./SelectDevice";
import { StreamDetail } from "./StreamDetail";

export function StreamItem(props: {
  kind: "sink" | "source";
  toggleDetail: () => void;
  stream: PactlStream;
  refresh: () => Promise<void>;
}) {
  const { kind, stream, toggleDetail, refresh } = props;

  const { audio } = useAudioState();
  const devices =
    kind === "sink" ? (audio?.sinks ?? []) : (audio?.sources ?? []);

  const deviceName = devices.find((d) => d.index === stream[kind])?.description;

  const vol = percentFromVolume(stream.volume);
  const icon =
    kind === "sink"
      ? speakerIconForPercentAndMute(vol, stream.mute)
      : micIconForMute(stream.mute);
  const title = appNameForStream(stream);
  const typeLabel = kind === "sink" ? "Output" : "Input";

  async function toggleMute(): Promise<void> {
    try {
      await pactl.setStreamMute(stream.index, "toggle", kind);
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to toggle mute", error: e });
    }
  }

  async function setVolume(next: number): Promise<void> {
    try {
      const safe = clamp(next, 0, 150);
      await pactl.setStreamVolume(stream.index, safe, kind);
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to change volume", error: e });
    }
  }

  const actions = (
    <ActionPanel title={title}>
      <ActionPanel.Section title={typeLabel}>
        <Action.Push
          title={`Select ${typeLabel} Device`}
          icon={kind === "sink" ? Icon.SpeakerHigh : Icon.Microphone}
          target={
            <SelectDevice
              stream={stream}
              onOutputChange={refresh}
              kind={kind}
            />
          }
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Stream">
        <Action
          title={stream.mute ? "Unmute Stream" : "Mute Stream"}
          icon={stream.mute ? Icon.SpeakerOn : Icon.SpeakerOff}
          onAction={toggleMute}
        />
        <Action.CopyToClipboard title="Copy Stream Name" content={title} />
        <Action
          shortcut={detailsShortcut}
          title="Toggle Details"
          icon={Icon.Eye}
          onAction={toggleDetail}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Volume">
        <Action
          title="Increase Volume (+5%)"
          icon={Icon.SpeakerUp}
          onAction={() => setVolume((vol ?? 0) + 5)}
          shortcut={{
            modifiers: ["ctrl"],
            key: "arrowUp",
          }}
        />
        <Action
          title="Decrease Volume (-5%)"
          icon={Icon.SpeakerDown}
          onAction={() => setVolume((vol ?? 0) - 5)}
          shortcut={{
            modifiers: ["shift"],
            key: "arrowUp",
          }}
        />
        <Action.Push
          title="Set Volume…"
          icon={Icon.Gauge}
          target={
            <SetVolumeForm
              kind={kind}
              type="stream"
              deviceIndex={stream.index}
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
          shortcut={
            Keyboard.Shortcut.Common.Refresh as Keyboard.Shortcut.Common
          }
          onAction={refresh}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List.Item
      title={title}
      icon={icon}
      subtitle={deviceName}
      accessories={deviceAccessories({
        isDefault: false,
        muted: stream.mute,
        volumePercent: vol,
      })}
      detail={
        <StreamDetail
          kind={kind}
          stream={stream}
          volumePercent={vol}
          sinkName={deviceName}
        />
      }
      actions={actions}
      keywords={[
        stream.properties["application.name"],
        deviceName ?? "",
        stream.properties?.["application.name"] ?? "",
      ]}
    />
  );
}
