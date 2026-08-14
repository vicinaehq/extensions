import { execFile } from "child_process";
import { stat } from "fs/promises";
import path from "path";
import { promisify } from "util";

import { GitCommit, GitStatus } from "@/types";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 5_000;

let gitAvailableCache: boolean | null = null;

export async function isGitAvailable(): Promise<boolean> {
  if (gitAvailableCache !== null) {
    return gitAvailableCache;
  }

  try {
    await execFileAsync("git", ["--version"], { encoding: "utf8", timeout: GIT_TIMEOUT_MS });
    gitAvailableCache = true;
  } catch {
    gitAvailableCache = false;
  }

  return gitAvailableCache;
}

export async function checkoutGitBranch(repoPath: string, branch: string): Promise<boolean> {
  if (!(await isGitAvailable())) return false;

  try {
    await execFileAsync("git", ["checkout", branch], { cwd: repoPath, timeout: GIT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

export async function getCommitLog(repoPath: string): Promise<GitCommit[]> {
  if (!(await isGitAvailable())) return [];

  try {
    const { stdout } = await execFileAsync("git", ["log", "-n", "50", "--pretty=format:%H|%an|%ar|%s"], {
      cwd: repoPath,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
    });

    return stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [hash, author, relativeTime, ...messageParts] = line.split("|");
        return {
          author: author || "Unknown",
          hash: hash || "",
          message: messageParts.join("|") || "",
          relativeTime: relativeTime || "",
        };
      });
  } catch {
    return [];
  }
}

export async function getGitStatus(repoPath: string): Promise<GitStatus | null> {
  if (!(await isGitAvailable()) || !(await isGitRepo(repoPath))) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "status", "-sb", "--porcelain=v1"], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
    });

    const lines = stdout.split("\n").filter((line) => line.length > 0);
    const header = lines[0];
    if (!header?.startsWith("## ")) {
      return null;
    }

    const rest = header.slice(3);
    const branch = rest.split("...")[0]?.trim();
    if (!branch) {
      return null;
    }

    return {
      branch,
      dirty: lines.length - 1,
      pull: Number(rest.match(/behind (\d+)/)?.[1] ?? 0),
      push: Number(rest.match(/ahead (\d+)/)?.[1] ?? 0),
    };
  } catch {
    return null;
  }
}

export async function getLocalBranches(repoPath: string): Promise<string[]> {
  if (!(await isGitAvailable())) return [];

  try {
    const { stdout } = await execFileAsync("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout
      .split("\n")
      .map((branch) => branch.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function getRemoteUrl(repoPath: string): Promise<null | string> {
  if (!(await isGitAvailable())) return null;

  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], {
      cwd: repoPath,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
    });

    return normalizeRemoteUrl(stdout.trim());
  } catch {
    return null;
  }
}

export async function pullGitBranch(repoPath: string): Promise<boolean> {
  if (!(await isGitAvailable())) return false;

  try {
    await execFileAsync("git", ["pull"], { cwd: repoPath, timeout: GIT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

function isGitRepo(repoPath: string): Promise<boolean> {
  return stat(path.join(repoPath, ".git")).then(
    () => true,
    () => false,
  );
}

function normalizeRemoteUrl(url: string): null | string {
  if (!url) return null;

  if (url.startsWith("git@")) {
    const [host, repoPath] = url.split(":");
    if (!host || !repoPath) return null;
    return `https://${host.replace("git@", "")}/${repoPath.replace(/\.git$/, "")}`;
  }

  if (url.startsWith("https://") || url.startsWith("http://")) {
    return url.replace(/\.git$/, "");
  }

  return null;
}
