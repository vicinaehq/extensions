import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { ghosttyBin, openGhosttyWindow, resolveOpenPath, type Preferences } from "./lib";

export default async function Command(props: { arguments?: { path?: string } }) {
  const cwd = resolveOpenPath(props?.arguments?.path);
  try {
    openGhosttyWindow(cwd, ghosttyBin(getPreferenceValues<Preferences>()));
  } catch (e: any) {
    await showToast({ style: Toast.Style.Failure, title: "Could not open path in Ghostty", message: e?.message || String(e) });
  }
}
