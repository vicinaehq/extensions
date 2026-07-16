import { showToast, Toast, getPreferenceValues, closeMainWindow } from "@vicinae/api";
import { whisrsToggle, WhisrsError, type WhisrsPrefs } from "./whisrs";

export default async function ToggleCommand() {
  const prefs = getPreferenceValues<WhisrsPrefs>();
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Toggling whisrs…",
    message: "Press your hotkey again to stop recording.",
  });
  try {
    await whisrsToggle(prefs);
    toast.style = Toast.Style.Success;
    toast.title = "Toggled";
    await toast.update();
    await closeMainWindow();
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to toggle whisrs";
    toast.message = e instanceof WhisrsError ? e.message : String(e);
    await toast.update();
  }
}
