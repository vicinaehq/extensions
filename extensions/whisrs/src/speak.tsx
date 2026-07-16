import { showToast, Toast, getPreferenceValues } from "@vicinae/api";
import { whisrsSpeak, WhisrsError, type WhisrsPrefs } from "./whisrs";

export default async function SpeakCommand() {
  const prefs = getPreferenceValues<WhisrsPrefs>();
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Reading aloud…",
    message: "Press the command again to stop.",
  });
  try {
    await whisrsSpeak(prefs);
    toast.style = Toast.Style.Success;
    toast.title = "Reading selection aloud";
    await toast.update();
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to read aloud";
    toast.message = e instanceof WhisrsError ? e.message : String(e);
    await toast.update();
  }
}
