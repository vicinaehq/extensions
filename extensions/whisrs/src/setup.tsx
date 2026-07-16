import { showToast, Toast, getPreferenceValues, runInTerminal } from "@vicinae/api";
import { whisrsSetupCommand, WhisrsError, type WhisrsPrefs } from "./whisrs";

export default async function SetupCommand() {
  const prefs = getPreferenceValues<WhisrsPrefs>();
  try {
    runInTerminal(whisrsSetupCommand(prefs), { hold: true });
    await showToast({
      style: Toast.Style.Success,
      title: "Opening whisrs setup",
      message: "Complete the steps in the terminal window.",
    });
  } catch (e) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to launch setup",
      message: e instanceof WhisrsError ? e.message : String(e),
    });
  }
}
