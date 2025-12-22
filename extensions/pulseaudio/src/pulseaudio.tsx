import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
} from "@vicinae/api";
import { useMemo, useState } from "react";
import { displayNameForDevice } from "./pactl";
import { AudioDeviceItem } from "./components/AudioDeviceItem";
import { useAudioState } from "./hooks/useAudioState";
import { sortDevicesWithDefaultFirst } from "./ui/sortDevices";

type ViewFilter = "all" | "outputs" | "inputs";

export default function SoundManagerCommand() {
  const { audio, isLoading, refresh } = useAudioState();
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const refreshShortcut = Keyboard.Shortcut.Common.Refresh as Keyboard.Shortcut.Common;

  const searchAccessory = useMemo(
    () => (
      <List.Dropdown
        id="view-filter"
        tooltip="Show"
        storeValue
        defaultValue="all"
        onChange={(v) => setViewFilter((v as ViewFilter) || "all")}
      >
        <List.Dropdown.Item title="All Devices" value="all" icon={Icon.AppWindowList} />
        <List.Dropdown.Item title="Outputs Only" value="outputs" icon={Icon.SpeakerHigh} />
        <List.Dropdown.Item title="Inputs Only" value="inputs" icon={Icon.Microphone} />
      </List.Dropdown>
    ),
    [],
  );

  const emptyActions = (
    <ActionPanel>
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={refreshShortcut} onAction={refresh} />
    </ActionPanel>
  );

  const errorActions = (
    <ActionPanel>
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={refreshShortcut} onAction={refresh} />
      <ActionPanel.Section title="Copy install command">
        <Action.CopyToClipboard title="Fedora (dnf)" content="sudo dnf install pulseaudio-utils" />
        <Action.CopyToClipboard title="Debian/Ubuntu (apt)" content="sudo apt install pulseaudio-utils" />
        <Action.CopyToClipboard title="Arch (pacman)" content="sudo pacman -S libpulse" />
      </ActionPanel.Section>
    </ActionPanel>
  );

  const listActions = !isLoading && !audio ? errorActions : emptyActions;

  const sinksSorted = useMemo(
    () => sortDevicesWithDefaultFirst(audio?.sinks ?? [], audio?.info.default_sink_name, displayNameForDevice),
    [audio],
  );

  const sourcesSorted = useMemo(
    () => sortDevicesWithDefaultFirst(audio?.sources ?? [], audio?.info.default_source_name, displayNameForDevice),
    [audio],
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      navigationTitle="Sound Settings"
      searchBarPlaceholder="Search audio devices…"
      searchBarAccessory={searchAccessory}
      actions={listActions}
    >
      {!isLoading && !audio ? (
        <List.EmptyView
          title="Unable to load audio devices"
          description={
            [
              "This command requires the `pactl` CLI tool and a running PulseAudio/PipeWire-Pulse server.",
              "",
              "1) Install `pactl`:",
              "- Fedora: sudo dnf install pulseaudio-utils",
              "- Debian/Ubuntu: sudo apt install pulseaudio-utils",
              "- Arch: sudo pacman -S libpulse",
              "",
              "2) If `pactl` is installed but still fails, ensure your audio server is running (PipeWire/PulseAudio), then press Refresh.",
            ].join("\n")
          }
          icon={Icon.Warning}
        />
      ) : null}
      {viewFilter !== "inputs" ? (
        <List.Section
          title="Output Devices"
          subtitle={
            audio?.defaultSink
              ? `Default: ${displayNameForDevice(audio.defaultSink)}`
              : audio
                ? "No default output"
                : undefined
          }
        >
          {sinksSorted.map((sink) => (
            <AudioDeviceItem
              key={sink.name}
              kind="sink"
              device={sink}
              defaultName={audio?.info.default_sink_name}
              refresh={refresh}
              refreshShortcut={refreshShortcut}
            />
          ))}
        </List.Section>
      ) : null}

      {viewFilter !== "outputs" ? (
        <List.Section
          title="Input Devices"
          subtitle={
            audio?.defaultSource
              ? `Default: ${displayNameForDevice(audio.defaultSource)}`
              : audio
                ? "No default input"
                : undefined
          }
        >
          {sourcesSorted.map((source) => (
            <AudioDeviceItem
              key={source.name}
              kind="source"
              device={source}
              defaultName={audio?.info.default_source_name}
              refresh={refresh}
              refreshShortcut={refreshShortcut}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}




