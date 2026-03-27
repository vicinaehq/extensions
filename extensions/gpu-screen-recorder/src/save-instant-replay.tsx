import { showToast, Toast } from "@vicinae/api";
import { getRecorderStatus, saveInstantReplay } from "./recorder";

export default async function SaveInstantReplay() {
  const status = await getRecorderStatus();

  if (status !== "instant-replay") {
    await showToast({
      style: Toast.Style.Failure,
      title: "Not in Instant Replay",
      message: "Start Instant Replay first to save",
    });
    return;
  }

  const result = await saveInstantReplay();

  if (result.success) {
    await showToast({
      style: Toast.Style.Success,
      title: "Saved",
      message: "Last replay saved",
    });
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to save",
      message: result.error,
    });
  }
}
