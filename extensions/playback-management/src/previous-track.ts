import { closeMainWindow } from "@vicinae/api";
import { previous } from "./utils/playerctl.service";
import { showGenericPlayerCtlError } from "./utils/show-error";

export default async function NoView() {
  try {
    await previous();
  } catch {
    await showGenericPlayerCtlError();
    return;
  }

  await closeMainWindow();
}
