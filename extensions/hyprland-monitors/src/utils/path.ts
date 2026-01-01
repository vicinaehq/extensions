import { statSync } from "fs";
import os from "os";
import { join, resolve } from "path";

export function fileExists(path: string) {
  try {
    const stats = statSync(path);
    if (stats.isFile()) return true;
    return false;
  } catch {
    return false;
  }
}

export function resolveAbsolutePath(input: string) {
  const expanded = expandHomePath(input);
  return resolve(expanded);
}

export function expandHomePath(input: string) {
  if (!input) return os.homedir();
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return join(os.homedir(), input.slice(2));

  return input;
}
