import { Icon } from "@vicinae/api";

export function attachmentIcon(mimeType: string): Icon {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) return Icon.Image;
  if (normalized.startsWith("audio/")) return Icon.Music;
  if (normalized.startsWith("video/")) return Icon.Video;
  if (normalized.startsWith("text/")) return Icon.Code;
  if (normalized.includes("zip") || normalized.includes("compressed") || normalized.includes("archive")) return Icon.Box;
  return Icon.BlankDocument;
}
