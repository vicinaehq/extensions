import { closeMainWindow } from "@vicinae/api";
import { next } from "./utils/playerctl.service";
import { showGenericPlayerCtlError } from "./utils/show-error";

export default async function NoView() {
  try {
    await next();
  } catch {
    await showGenericPlayerCtlError();
    return;
  }

  await closeMainWindow();
}
