import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { pactl, type PactlDevice } from "../pactl";
import { detailsShortcut } from "../shortcuts";
import { micIconForMute, speakerIconForPercentAndMute } from "../ui/audioIcons";
import { deviceAccessories } from "../ui/deviceAccessories";
import { clamp } from "../ui/format";
import { showErrorToast } from "../ui/toasts";
import { AudioDeviceDetail } from "./AudioDeviceDetail";
import { SetVolumeForm } from "./SetVolumeForm";
import { percentFromVolume } from "../utils/percentFromVolume";
import { displayNameForDevice } from "../utils/displayNameForDevice";

export function AudioDeviceItem(props: {
  kind: "sink" | "source";
  device: PactlDevice;
  defaultName?: string;
  refresh: () => Promise<void>;
  toggleDetail: () => void;
}) {
  const { device, kind, defaultName, refresh, toggleDetail } = props;
  const isDefault = !!defaultName && device.name === defaultName;
  const vol = percentFromVolume(device.volume);

  const icon =
    kind === "sink"
      ? speakerIconForPercentAndMute(vol, device.mute)
      : micIconForMute(device.mute);
  const title = displayNameForDevice(device);

  const typeLabel = kind === "sink" ? "Output" : "Input";

  async function setAsDefault(): Promise<void> {
    try {
      await pactl.setDefaultDevice(device.name, kind);
      await showToast({
        style: Toast.Style.Success,
        title: `Default ${typeLabel.toLowerCase()} updated`,
        message: title,
      });
      await refresh();
    } catch (e) {
      await showErrorToast({
        title: `Failed to set default ${typeLabel.toLowerCase()}`,
        error: e,
      });
    }
  }

  async function toggleMute(): Promise<void> {
    try {
      await pactl.setDeviceMute(device.name, kind, "toggle");
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to toggle mute", error: e });
    }
  }

  async function setVolume(next: number): Promise<void> {
    try {
      const safe = clamp(next, 0, 150);
      await pactl.setDeviceVolume(device.name, safe, kind);
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
            title={`Set as Default ${typeLabel}`}
            icon={Icon.CheckCircle}
            onAction={setAsDefault}
          />
        ) : null}
        <Action
          title={device.mute ? `Unmute ${typeLabel}` : `Mute ${typeLabel}`}
          icon={icon}
          onAction={toggleMute}
        />
        <Action.CopyToClipboard
          title="Copy Device Name"
          content={device.name}
        />
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
              kind={kind}
              type="device"
              deviceName={device.name}
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
      accessories={deviceAccessories({
        isDefault,
        muted: device.mute,
        volumePercent: vol,
      })}
      detail={
        <AudioDeviceDetail
          kind={kind}
          device={device}
          isDefault={isDefault}
          volumePercent={vol}
        />
      }
      actions={actions}
      keywords={[device.name, device.description ?? ""]}
    />
  );
}
