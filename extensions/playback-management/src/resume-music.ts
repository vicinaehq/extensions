import { closeMainWindow } from "@vicinae/api";
import { play } from "./utils/playerctl.service";
import { showGenericPlayerCtlError } from "./utils/show-error";

export default async function NoView() {
  try {
    await play();
  } catch {
    await showGenericPlayerCtlError();
    return;
  }

  await closeMainWindow();
}
