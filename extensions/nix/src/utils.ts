import { Clipboard } from "@vicinae/api";
import { showToast, Toast } from "@vicinae/api";

export async function copyToClipboard(text: string, title: string) {
  try {
    await Clipboard.copy(text);
    showToast({
      style: Toast.Style.Success,
      title: "Copied",
      message: `${title} copied to clipboard`,
    });
  } catch {
    showToast({
      style: Toast.Style.Failure,
      title: "Copy failed",
      message: `Failed to copy ${title.toLowerCase()}`,
    });
  }
}
