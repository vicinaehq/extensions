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

export function relativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}
