import { homedir } from "node:os";
import { join } from "node:path";

export function isLocalPath(url: string): boolean {
  return (
    url.startsWith("/") || url.startsWith("~/") || url.startsWith("file://")
  );
}

export function expandPath(p: string): string {
  if (p.startsWith("file://")) p = p.slice(7);
  if (p.startsWith("~/")) p = join(homedir(), p.slice(2));
  return p;
}
