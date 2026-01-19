import { execJJ } from "./exec";

export function getJJDiff(path?: string): string {
  return execJJ("diff", path);
}
