import { showToast, Toast } from "@vicinae/api";

export async function showGenericPlayerCtlError() {
  await showToast(Toast.Style.Failure, "playerctl command error");
}
