import { useMemo } from "react";
import { execFileSync } from "child_process";
import { parseGitHubRemote } from "../utils/parseGitHubRemote";

export function useGetGitContext(path?: string) {
  return useMemo(() => {
    const normalizedPath = path?.trim();

    if (!normalizedPath) return;

    const repoRoot = runGitCommand(
      ["rev-parse", "--show-toplevel"],
      normalizedPath,
    );

    if (!repoRoot) return;

    const branch = runGitCommand(["symbolic-ref", "--short", "HEAD"], repoRoot);
    const remoteUrl = runGitCommand(["remote", "get-url", "origin"], repoRoot);
    const latestCommitMessage = runGitCommand(
      ["log", "-1", "--pretty=%B"],
      repoRoot,
    );

    return {
      branch,
      inferredFullName: remoteUrl ? parseGitHubRemote(remoteUrl) : null,
      latestCommitDescription: latestCommitMessage,
      latestCommitTitle: latestCommitMessage?.split("\n")[0] || null,
      remoteUrl,
      repoRoot,
    };
  }, [path]);
}

function runGitCommand(args: string[], cwd: string): string | null {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    });

    const normalizedStdout = stdout.trim();

    return normalizedStdout.length > 0 ? normalizedStdout : null;
  } catch {
    return null;
  }
}
