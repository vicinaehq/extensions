import { Toast, getPreferenceValues, showToast } from "@vicinae/api";
import { Preferences, cleanupArgs } from "./lib";
import { spawnInTerminal } from "./terminal";

export default async function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const args = cleanupArgs(prefs);
  try {
    await spawnInTerminal(args, prefs);
    await showToast({ style: Toast.Style.Success, title: "Started Linuxbrew cleanup", message: args.join(" ") });
  } catch (e: any) {
    await showToast({ style: Toast.Style.Failure, title: "Could not start Linuxbrew cleanup", message: e?.message || String(e) });
  }
}
