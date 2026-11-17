import { access } from "fs/promises";
import path from "path";

const README_CANDIDATES = [
  "README.md",
  "README",
  "Readme.md",
  "readme.md",
  "README.txt",
  "README.rst",
  "README.adoc",
];

export async function findReadmePath(projectPath: string): Promise<string | null> {
  for (const name of README_CANDIDATES) {
    const candidate = path.join(projectPath, name);
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
