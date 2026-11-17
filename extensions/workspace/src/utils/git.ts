import { execFile } from "child_process";
import { stat } from "fs/promises";
import path from "path";
import { promisify } from "util";

import { GitCommit, GitResult, GitStatus } from "@/types";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 5_000;
const GIT_PULL_TIMEOUT_MS = 30_000;

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

export async function checkoutGitBranch(repoPath: string, branch: string): Promise<GitResult> {
  if (!(await isGitAvailable())) {
    return { message: "Git is not available", ok: false };
  }

  try {
    await execFileAsync("git", ["checkout", branch], { cwd: repoPath, timeout: GIT_TIMEOUT_MS });
    return { ok: true };
  } catch (error) {
    return { message: formatGitError(error, "Checkout failed"), ok: false };
  }
}

export async function getCommitLog(repoPath: string): Promise<GitCommit[]> {
  await ensureGitAvailable();

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
    throw new Error("Failed to load commit history");
  }
}

export async function getGitStatus(repoPath: string, options: { includeStash?: boolean } = {}): Promise<GitStatus | null> {
  if (!(await isGitAvailable()) || !(await isGitRepo(repoPath))) {
    return null;
  }

  try {
    const [{ stdout }, stash] = await Promise.all([
      execFileAsync("git", ["-C", repoPath, "status", "-sb", "--porcelain=v1"], {
        encoding: "utf8",
        timeout: GIT_TIMEOUT_MS,
      }),
      options.includeStash ? getStashCount(repoPath) : Promise.resolve(0),
    ]);

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

    let modified = 0;
    let untracked = 0;
    for (const line of lines.slice(1)) {
      if (line.startsWith("??")) {
        untracked += 1;
      } else {
        modified += 1;
      }
    }

    return {
      branch,
      dirty: modified + untracked,
      modified,
      pull: Number(rest.match(/behind (\d+)/)?.[1] ?? 0),
      push: Number(rest.match(/ahead (\d+)/)?.[1] ?? 0),
      stash,
      untracked,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function getLocalBranches(repoPath: string): Promise<string[]> {
  await ensureGitAvailable();

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
    throw new Error("Failed to list git branches");
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

export async function getCloneUrl(repoPath: string): Promise<null | string> {
  if (!(await isGitAvailable())) return null;

  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], {
      cwd: repoPath,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
    });
    const raw = stdout.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export async function pullGitBranch(repoPath: string): Promise<GitResult> {
  if (!(await isGitAvailable())) {
    return { message: "Git is not available", ok: false };
  }

  try {
    await execFileAsync("git", ["pull"], { cwd: repoPath, timeout: GIT_PULL_TIMEOUT_MS });
    return { ok: true };
  } catch (error) {
    return { message: formatGitError(error, "Pull failed"), ok: false };
  }
}

async function getStashCount(repoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-list", "--walk-reflogs", "--count", "refs/stash"], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
    });
    const count = Number(stdout.trim());
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

async function ensureGitAvailable(): Promise<void> {
  if (!(await isGitAvailable())) {
    throw new Error("Git is not available");
  }
}

export function isGitRepo(repoPath: string): Promise<boolean> {
  return stat(path.join(repoPath, ".git")).then(
    () => true,
    () => false,
  );
}

export function commitBrowserUrl(remoteUrl: string, hash: string): string {
  try {
    const host = new URL(remoteUrl).hostname.toLowerCase();
    if (host === "gitlab.com" || host.startsWith("gitlab.") || host.includes(".gitlab.")) {
      return `${remoteUrl}/-/commit/${hash}`;
    }
    if (host === "bitbucket.org" || host.includes("bitbucket.")) {
      return `${remoteUrl}/commits/${hash}`;
    }
  } catch {
    // Fall through to the GitHub-style path.
  }

  return `${remoteUrl}/commit/${hash}`;
}

export function pullsBrowserUrl(remoteUrl: string): string {
  try {
    const host = new URL(remoteUrl).hostname.toLowerCase();
    if (host === "gitlab.com" || host.startsWith("gitlab.") || host.includes(".gitlab.")) {
      return `${remoteUrl}/-/merge_requests`;
    }
    if (host === "bitbucket.org" || host.includes("bitbucket.")) {
      return `${remoteUrl}/pull-requests`;
    }
  } catch {
    // Fall through to the GitHub-style path.
  }

  return `${remoteUrl}/pulls`;
}

export function formatGitError(error: unknown, fallback: string): string {
  const message = extractGitMessage(error);
  if (!message) {
    return fallback;
  }

  if (/conflict|CONFLICT/i.test(message)) {
    return "Merge conflicts: resolve them in the repo";
  }
  if (/Authentication|Permission denied|could not read Username|Login|403|401/i.test(message)) {
    return "Authentication failed: check credentials";
  }
  if (/timed?\s*out|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(message)) {
    return "Timed out waiting for git";
  }
  if (/local changes|uncommitted|would be overwritten|Please commit|stash/i.test(message)) {
    return "Uncommitted changes block this action";
  }
  if (/no tracking|no upstream|does not have.*upstream/i.test(message)) {
    return "No upstream branch configured";
  }

  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 140 ? `${compact.slice(0, 137)}…` : compact;
}

function extractGitMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return typeof error === "string" ? error : "";
  }

  const record = error as { message?: string; stderr?: string };
  return [record.stderr, record.message].filter(Boolean).join("\n");
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
