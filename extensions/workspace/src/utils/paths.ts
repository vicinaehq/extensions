import { existsSync, lstatSync } from "fs";
import os from "os";
import path from "path";

export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  return path.resolve(trimmed);
}

export function pathFromFormValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return resolveUserPath(value);
  }

  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
    return resolveUserPath(value[0]);
  }

  return undefined;
}

export function isExistingFile(filePath: string): boolean {
  return existsSync(filePath) && lstatSync(filePath).isFile();
}

export function isExistingDirectory(dirPath: string): boolean {
  return existsSync(dirPath) && lstatSync(dirPath).isDirectory();
}

export function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = parent.endsWith(path.sep) ? parent.slice(0, -1) : parent;
  return child === normalizedParent || child.startsWith(normalizedParent + path.sep);
}
