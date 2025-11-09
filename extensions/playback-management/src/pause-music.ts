import { closeMainWindow, showToast } from "@vicinae/api";
import { pause } from "./utils/playerctl.service";
import { showGenericPlayerCtlError } from "./utils/show-error";

export default async function NoView() {
  try {
    await pause();
  } catch {
    await showGenericPlayerCtlError();
    return;
  }

  await closeMainWindow();
}
