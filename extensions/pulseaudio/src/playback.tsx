import { List } from "@vicinae/api";
import { useState } from "react";
import { LoadingError } from "./components/LoadingError";
import { StreamItem } from "./components/StreamItem";
import { useAudioState } from "./hooks/useAudioState";

export default function Playback() {
  const { audio, isLoading, refresh } = useAudioState();
  const [showDetail, setShowDetail] = useState(false);

  const playbackStreams = audio?.sinkInputs || [];

  return (
    <List
      isShowingDetail={showDetail}
      navigationTitle="Playback Streams"
      searchBarPlaceholder="Search playback streams"
    >
      {!isLoading && !audio && <LoadingError />}
      {playbackStreams.map((stream) => (
        <StreamItem
          kind="sink"
          toggleDetail={() => setShowDetail((prev) => !prev)}
          refresh={refresh}
          stream={stream}
          key={stream.index}
        />
      ))}
    </List>
  );
}
