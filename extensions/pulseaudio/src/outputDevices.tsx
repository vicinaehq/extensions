import { useMemo, useState } from "react";
import { useAudioState } from "./hooks/useAudioState";
import { sortDevicesWithDefaultFirst } from "./utils/sortDevices";
import { List } from "@vicinae/api";
import { displayNameForDevice } from "./utils/displayNameForDevice";
import { AudioDeviceItem } from "./components/AudioDeviceItem";

export default function OutputDevices() {
  const { audio, isLoading, refresh } = useAudioState();
  const [showDetail, setShowDetail] = useState(false);

  const sinksSorted = useMemo(
    () =>
      sortDevicesWithDefaultFirst(
        audio?.sinks ?? [],
        audio?.info.default_sink_name,
        displayNameForDevice,
      ),
    [audio],
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail}
      navigationTitle="Output Devices"
      searchBarPlaceholder="Search output devices"
    >
      {sinksSorted.map((sink) => (
        <AudioDeviceItem
          kind="sink"
          key={sink.name}
          toggleDetail={() => setShowDetail((prev) => !prev)}
          device={sink}
          defaultName={audio?.info.default_sink_name}
          refresh={refresh}
        />
      ))}
    </List>
  );
}
