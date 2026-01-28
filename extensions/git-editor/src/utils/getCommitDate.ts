import { execSync } from "child_process";
import { formatDistanceToNow } from "date-fns";

export const getCommitDate = (hash: string, cwd: string) => {
  try {
    const dateStr = execSync(`git show -s --format=%ci ${hash}`, {
      cwd,
      encoding: "utf-8",
    }).trim();
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "";
  }
};
