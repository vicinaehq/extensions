import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { ghosttyBin, openGhosttyNewWindow, type Preferences } from "./lib";

export default async function Command() {
  try {
    openGhosttyNewWindow(undefined, ghosttyBin(getPreferenceValues<Preferences>()));
  } catch (e: any) {
    await showToast({ style: Toast.Style.Failure, title: "Could not open Ghostty", message: e?.message || String(e) });
  }
}
