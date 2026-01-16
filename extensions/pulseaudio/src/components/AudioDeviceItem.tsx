import { Action, ActionPanel, Icon, Keyboard, Toast, List, showToast } from "@vicinae/api";
import { displayNameForDevice, pactl, percentFromVolume, type PactlDevice } from "../pactl";
import { DeviceDetail } from "./DeviceDetail";
import { SetVolumeForm } from "./SetVolumeForm";
import { micIconForMute, speakerIconForPercentAndMute } from "../ui/audioIcons";
import { deviceAccessories } from "../ui/deviceAccessories";
import { clamp } from "../ui/format";
import { showErrorToast } from "../ui/toasts";
import { detailsShortcut } from "../shortcuts";

export function AudioDeviceItem(props: {
  kind: "sink" | "source";
  device: PactlDevice;
  defaultName?: string;
  refresh: () => Promise<void>;
  toggleDetail: () => void;
  refreshShortcut: Keyboard.Shortcut | Keyboard.Shortcut.Common;
}) {
  const { kind, device, defaultName, refresh, refreshShortcut, toggleDetail } = props;

  const isDefault = !!defaultName && device.name === defaultName;
  const vol = percentFromVolume(device.volume);

  const icon =
    kind === "sink" ? speakerIconForPercentAndMute(vol, device.mute) : micIconForMute(device.mute);
  const title = displayNameForDevice(device);
  const subtitle = isDefault ? "Default" : "";

  async function setAsDefault(): Promise<void> {
    try {
      if (kind === "sink") await pactl.setDefaultSink(device.name);
      else await pactl.setDefaultSource(device.name);
      await showToast({
        style: Toast.Style.Success,
        title: kind === "sink" ? "Default output updated" : "Default input updated",
        message: title,
      });
      await refresh();
    } catch (e) {
      await showErrorToast({
        title: kind === "sink" ? "Failed to set default output" : "Failed to set default input",
        error: e,
      });
    }
  }

  async function toggleMute(): Promise<void> {
    try {
      if (kind === "sink") await pactl.setSinkMute(device.name, "toggle");
      else await pactl.setSourceMute(device.name, "toggle");
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to toggle mute", error: e });
    }
  }

  async function setVolume(next: number): Promise<void> {
    try {
      const safe = clamp(next, 0, 150);
      if (kind === "sink") await pactl.setSinkVolume(device.name, safe);
      else await pactl.setSourceVolume(device.name, safe);
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to change volume", error: e });
    }
  }

  const actions = (
    <ActionPanel title={title}>
      <ActionPanel.Section title="Device">
        {!isDefault ? (
          <Action
            title={kind === "sink" ? "Set as Default Output" : "Set as Default Input"}
            icon={Icon.CheckCircle}
            onAction={setAsDefault}
          />
        ) : null}
        <Action
          title={
            kind === "sink"
              ? device.mute
                ? "Unmute Output"
                : "Mute Output"
              : device.mute
                ? "Unmute Input"
                : "Mute Input"
          }
          icon={
            kind === "sink"
              ? device.mute
                ? Icon.SpeakerOn
                : Icon.SpeakerOff
              : device.mute
                ? Icon.Microphone
                : Icon.MicrophoneDisabled
          }
          onAction={toggleMute}
        />
        <Action.CopyToClipboard title="Copy Device Name" content={device.name} />
        <Action
          shortcut={detailsShortcut}
          title="Toggle Details"
          icon={Icon.Eye}
          onAction={toggleDetail}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Volume">
        <Action title="Increase Volume (+5%)" icon={Icon.SpeakerUp} onAction={() => setVolume((vol ?? 0) + 5)} />
        <Action title="Decrease Volume (-5%)" icon={Icon.SpeakerDown} onAction={() => setVolume((vol ?? 0) - 5)} />
        <Action.Push
          title="Set Volume…"
          icon={Icon.Gauge}
          target={
            <SetVolumeForm
              kind={kind}
              deviceName={device.name}
              deviceTitle={title}
              currentPercent={vol}
              onDone={refresh}
            />
          }
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Other">
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={refreshShortcut} onAction={refresh} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List.Item
      title={title}
      subtitle={subtitle}
      icon={icon}
      accessories={deviceAccessories({ isDefault, muted: device.mute, volumePercent: vol })}
      detail={<DeviceDetail kind={kind} device={device} isDefault={isDefault} volumePercent={vol} />}
      actions={actions}
      keywords={[device.name, device.description ?? ""]}
    />
  );
}


