import { List, ActionPanel, Action, Icon, showToast, Color, Toast } from "@vicinae/api";
import { useState, useEffect } from "react";
import { getRecordings, removeRecording, toggleRecording, getRecordingStatus, Recording } from "./utils";

export default function ScreenRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [status, setStatus] = useState(getRecordingStatus());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    const recs = await getRecordings();
    setRecordings(recs);
  };

  const handleToggleRecording = async (withAudio: boolean) => {
    setLoading(true);
    try {
      await toggleRecording('screen', withAudio);

      if (status.isRecording) {
        // Stopped recording
        await showToast({
          title: "Recording stopped",
          style: Toast.Style.Success
        });
        await loadRecordings();
      } else {
        // Started recording
        await showToast({
          title: "Recording started",
          style: Toast.Style.Success
        });
      }

      setStatus(getRecordingStatus());
    } catch (error) {
      // Check if recording might have been saved despite the error
      await loadRecordings(); // Refresh list to see if file was added
      setStatus(getRecordingStatus());

      await showToast({
        title: "Recording failed",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRecording = async (recording: Recording) => {
    try {
      await removeRecording(recording.path);
      await loadRecordings();
      await showToast({
        title: "Recording removed",
        style: Toast.Style.Success
      });
    } catch (error) {
      await showToast({
        title: "Failed to remove recording",
        style: Toast.Style.Failure
      });
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return "";
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search recordings..."
      actions={
        <ActionPanel>
          <Action
            title="Start Screen Recording"
            icon={Icon.Video}
            onAction={() => handleToggleRecording(false)}
            shortcut={{ modifiers: ["ctrl"], key: "r" }}
          />
          <Action
            title="Start Recording with Audio"
            icon={Icon.Microphone}
            onAction={() => handleToggleRecording(true)}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
          />
        </ActionPanel>
      }
    >
      {/* Current recording status */}
      {status.isRecording && (
        <List.Item
          title={status.outputPath ? status.outputPath.split('/').pop() || 'Unknown' : 'Recording in progress...'}
          subtitle="Recording in progress..."
          icon={{ source: Icon.CircleFilled, tintColor: Color.Red }}
          actions={
            <ActionPanel>
              <Action
                title="Stop Recording"
                icon={Icon.Stop}
                onAction={() => handleToggleRecording(false)}
                style="destructive"
              />
            </ActionPanel>
          }
        />
      )}

      {/* Recordings history */}
      {recordings.length > 0 && recordings.map((recording) => (
        <List.Item
          key={recording.id}
          title={recording.path.split('/').pop() || 'Unknown'}
          subtitle={`${recording.timestamp.toLocaleString()} • ${formatFileSize(recording.size)}`}
          icon={Icon.Video}
          actions={
            <ActionPanel>
              <Action
                title="Start Screen Recording"
                icon={Icon.Video}
                onAction={() => handleToggleRecording(false)}
                shortcut={{ modifiers: ["ctrl"], key: "r" }}
              />
              <Action
                title="Start Recording with Audio"
                icon={Icon.Microphone}
                onAction={() => handleToggleRecording(true)}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
              />
              <ActionPanel.Section>
                <Action.Open
                  title="Open Recording"
                  icon={Icon.Video}
                  target={recording.path}
                />
                <Action.CopyToClipboard
                  title="Copy Path"
                  content={recording.path}
                  shortcut={{ modifiers: ["ctrl"], key: "c" }}
                />
                <Action
                  title="Remove Recording"
                  icon={Icon.Trash}
                  onAction={() => handleRemoveRecording(recording)}
                  style="destructive"
                  shortcut={{ key: "delete" }}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}

      {/* Empty state */}
      {recordings.length === 0 && !status.isRecording && (
        <List.EmptyView
          title="No recordings yet"
          description="Start your first screen recording"
          icon={Icon.Video}
        />
      )}
    </List>
  );
}