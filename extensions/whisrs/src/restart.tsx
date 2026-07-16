import { showToast, Toast, getPreferenceValues } from "@vicinae/api";
import { whisrsRestart, WhisrsError, type WhisrsPrefs } from "./whisrs";

export default async function RestartCommand() {
  const prefs = getPreferenceValues<WhisrsPrefs>();
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Restarting whisrs daemon…",
  });
  try {
    await whisrsRestart(prefs);
    toast.style = Toast.Style.Success;
    toast.title = "Daemon restarted";
    await toast.update();
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to restart daemon";
    toast.message = e instanceof WhisrsError ? e.message : String(e);
    await toast.update();
  }
}
