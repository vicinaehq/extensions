import { environment } from "@vicinae/api";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function messageImageCachePath(): string {
  return path.join(environment.supportPath, "message-images");
}

export async function clearMessageImageCache(): Promise<void> {
  await rm(messageImageCachePath(), { recursive: true, force: true });
}

export async function cleanupMessageImageCache(maxAgeMs = CACHE_MAX_AGE_MS): Promise<void> {
  const root = messageImageCachePath();
  const cutoff = Date.now() - maxAgeMs;
  const visit = async (directory: string): Promise<boolean> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    let hasRecentFiles = false;
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (await visit(target)) hasRecentFiles = true;
      } else {
        const metadata = await stat(target).catch(() => undefined);
        if (metadata && metadata.mtimeMs < cutoff) {
          await rm(target, { force: true });
        } else if (metadata) {
          hasRecentFiles = true;
        }
      }
    }
    if (directory !== root && !hasRecentFiles) await rm(directory, { recursive: true, force: true });
    return hasRecentFiles;
  };
  await visit(root);
}
