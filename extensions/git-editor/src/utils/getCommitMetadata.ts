import { execSync } from "child_process";
import { format, formatDistanceToNow } from "date-fns";

export const getCommitDate = (hash: string, cwd: string) => {
  try {
    const dateStr = execSync(`git show -s --format=%ci ${hash}`, {
      cwd,
      encoding: "utf-8",
    }).trim();
    return new Date(dateStr);
  } catch {
    return "";
  }
};

export const getCommitAuthor = (hash: string, cwd: string) => {
  try {
    return execSync(`git show -s --format=%an ${hash}`, {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
};

export const getCommitRefs = (hash: string, cwd: string) => {
  try {
    const refs = execSync(`git show -s --format=%D ${hash}`, {
      cwd,
      encoding: "utf-8",
    }).trim();
    if (!refs) return { branches: [], tags: [] };

    const parts = refs.split(", ");
    const branches: string[] = [];
    const tags: string[] = [];

    for (const part of parts) {
      if (part.startsWith("tag: ")) {
        tags.push(part.replace("tag: ", ""));
      } else if (part.includes(" -> ")) {
        // Handle HEAD -> branch format
        const branch = part.split(" -> ")[1];
        if (branch) branches.push(branch);
      } else {
        branches.push(part);
      }
    }

    return { branches, tags };
  } catch {
    return { branches: [], tags: [] };
  }
};

export const getCommitFullHash = (hash: string, cwd: string) => {
  try {
    return execSync(`git rev-parse ${hash}`, {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    return hash;
  }
};

export type FileStats = {
  added: number;
  modified: number;
  removed: number;
};

export const getCommitFileStats = (hash: string, cwd: string): FileStats => {
  try {
    const output = execSync(`git show --stat --format= ${hash}`, {
      cwd,
      encoding: "utf-8",
    }).trim();

    const lines = output.split("\n");
    const summaryLine = lines[lines.length - 1];

    let added = 0;
    let removed = 0;
    let modified = 0;

    // Parse insertions
    const insertMatch = summaryLine.match(/(\d+) insertion/);
    if (insertMatch) added = parseInt(insertMatch[1], 10);

    // Parse deletions
    const deleteMatch = summaryLine.match(/(\d+) deletion/);
    if (deleteMatch) removed = parseInt(deleteMatch[1], 10);

    // Parse files changed
    const filesMatch = summaryLine.match(/(\d+) files? changed/);
    if (filesMatch) modified = parseInt(filesMatch[1], 10);

    return { added, modified, removed };
  } catch {
    return { added: 0, modified: 0, removed: 0 };
  }
};

export type CommitMetadata = {
  naturalDate: string;
  date: string;
  author: string;
  branches: string[];
  tags: string[];
  fullHash: string;
  fileStats: FileStats;
};

export const getCommitMetadata = (
  hash: string,
  cwd: string,
): CommitMetadata => {
  const date = getCommitDate(hash, cwd);
  const naturalDate = formatDistanceToNow(date, { addSuffix: true });
  const author = getCommitAuthor(hash, cwd);
  const { branches, tags } = getCommitRefs(hash, cwd);
  const fullHash = getCommitFullHash(hash, cwd);
  const fileStats = getCommitFileStats(hash, cwd);
  return {
    naturalDate,
    date: date.toLocaleString(),
    author,
    branches,
    tags,
    fullHash,
    fileStats,
  };
};
