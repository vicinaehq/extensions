import { showToast, Toast } from "@vicinae/api";
import { getRecorderStatus, stopRecording } from "./recorder";

export default async function StopInstantReplay() {
  const status = await getRecorderStatus();

  if (status === "idle") {
    await showToast({
      style: Toast.Style.Failure,
      title: "Not in Instant Replay",
      message: "No active Instant Replay to stop",
    });
    return;
  }

  if (status === "recording") {
    await showToast({
      style: Toast.Style.Failure,
      title: "Recording is active",
      message: "This command only stops Instant Replay, not recording",
    });
    return;
  }

  const result = await stopRecording();

  if (result.success) {
    await showToast({
      style: Toast.Style.Success,
      title: "Instant Replay stopped",
    });
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to stop Instant Replay",
      message: result.error,
    });
  }
}
