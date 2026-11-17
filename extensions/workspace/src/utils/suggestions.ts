import os from "os";
import path from "path";

import { isExistingDirectory } from "@/utils/paths";

const SUGGESTED_FOLDER_NAMES = ["Projects", "Developer", "code", "src", "repos", "work", "dev"];

export function suggestedWorkspacePaths(existing: string[] = []): string[] {
  const home = os.homedir();
  const existingSet = new Set(existing);
  const candidates = SUGGESTED_FOLDER_NAMES.map((name) => path.join(home, name));

  return candidates.filter((candidate) => isExistingDirectory(candidate) && !existingSet.has(candidate));
}
