import { Clipboard, Toast, closeMainWindow, showToast } from "@vicinae/api";
import { updateLastUsedPassword } from "@/storage/last-used";
import { PasswordOption } from "@/types";

export type PasswordActionType = "copy" | "paste";

export async function performPasswordAction(
  passwordName: string,
  option: PasswordOption,
  action: PasswordActionType,
): Promise<void> {
  const concealed = option.type === "password" || option.type === "otp";

  try {
    if (action === "copy") {
      await Clipboard.copy(option.value, { concealed });
    } else {
      await closeMainWindow();
      await Clipboard.paste(option.value);
    }

    await updateLastUsedPassword(passwordName, option.title);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    await showToast({
      style: Toast.Style.Failure,
      title: `Failed to ${action}`,
      message,
    });
  }
}
