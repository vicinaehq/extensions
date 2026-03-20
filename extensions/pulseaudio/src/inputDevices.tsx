import { useMemo, useState } from "react";
import { useAudioState } from "./hooks/useAudioState";
import { sortDevicesWithDefaultFirst } from "./utils/sortDevices";
import { List } from "@vicinae/api";
import { displayNameForDevice } from "./utils/displayNameForDevice";
import { AudioDeviceItem } from "./components/AudioDeviceItem";

export default function InputDevices() {
  const { audio, isLoading, refresh } = useAudioState();
  const [showDetail, setShowDetail] = useState(false);

  const sourcesSorted = useMemo(
    () =>
      sortDevicesWithDefaultFirst(
        audio?.sources ?? [],
        audio?.info.default_source_name,
        displayNameForDevice,
      ),
    [audio],
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail}
      navigationTitle="Input Devices"
      searchBarPlaceholder="Search input devices"
    >
      {sourcesSorted.map((source) => (
        <AudioDeviceItem
          kind="source"
          key={source.name}
          toggleDetail={() => setShowDetail((prev) => !prev)}
          device={source}
          defaultName={audio?.info.default_source_name}
          refresh={refresh}
        />
      ))}
    </List>
  );
}
