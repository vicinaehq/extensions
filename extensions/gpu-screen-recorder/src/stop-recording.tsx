import { showToast, Toast } from "@vicinae/api";
import { getRecorderStatus, stopRecording } from "./recorder";

export default async function StopRecording() {
  const status = await getRecorderStatus();

  if (status === "idle") {
    await showToast({
      style: Toast.Style.Failure,
      title: "Not recording",
      message: "No active recording to stop",
    });
    return;
  }

  if (status === "instant-replay") {
    await showToast({
      style: Toast.Style.Failure,
      title: "Instant Replay is active",
      message: "This command only stops recording, not Instant Replay",
    });
    return;
  }

  const result = await stopRecording();

  if (result.success) {
    await showToast({
      style: Toast.Style.Success,
      title: "Recording stopped",
      message: "Recording saved",
    });
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to stop recording",
      message: result.error,
    });
  }
}
