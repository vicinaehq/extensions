import { List } from "@vicinae/api";
import { useState } from "react";
import { LoadingError } from "./components/LoadingError";
import { useAudioState } from "./hooks/useAudioState";
import { StreamItem } from "./components/StreamItem";

export default function Recording() {
  const { audio, isLoading, refresh } = useAudioState();
  const [showDetail, setShowDetail] = useState(false);

  const recordingStreams = audio?.sourceOutputs || [];

  return (
    <List
      isShowingDetail={showDetail}
      navigationTitle="Recording Streams"
      searchBarPlaceholder="Search recording streams"
    >
      {!isLoading && !audio && <LoadingError />}
      {recordingStreams.map((stream) => (
        <StreamItem
          kind="source"
          toggleDetail={() => setShowDetail((prev) => !prev)}
          refresh={refresh}
          stream={stream}
          key={stream.index}
        />
      ))}
    </List>
  );
}
