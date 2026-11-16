import { Alert, confirmAlert, showToast, Toast } from "@vicinae/api";
import { formatBytes } from "./format";

export interface CacheUsage {
  files: number;
  bytes: number;
}

export function describeUsage(usage: CacheUsage): string {
  return `${usage.files} file${usage.files === 1 ? "" : "s"}, ${formatBytes(usage.bytes) ?? "0 B"}`;
}

/** Ask for confirmation, then clear the cache and report what was freed. */
export async function confirmAndClearArtworkCache(
  usage: CacheUsage,
  clear: () => CacheUsage,
  options: { redownload: boolean },
): Promise<void> {
  if (usage.files === 0) {
    await showToast({ style: Toast.Style.Success, title: "Artwork cache is already empty" });
    return;
  }
  const confirmed = await confirmAlert({
    title: "Clear downloaded artwork?",
    message:
      `This deletes the high-quality artwork and icons this extension downloaded (${describeUsage(usage)}). ` +
      "Launchers' own artwork and your custom artwork are not touched." +
      (options.redownload ? " Artwork for the current view will be downloaded again." : ""),
    primaryAction: { title: "Clear Cache", style: Alert.ActionStyle.Destructive },
  });
  if (!confirmed) return;
  const freed = clear();
  await showToast({ style: Toast.Style.Success, title: "Cleared artwork cache", message: describeUsage(freed) });
}
