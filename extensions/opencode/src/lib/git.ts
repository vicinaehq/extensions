import { execFile } from "node:child_process";

/**
 * Read-only local git access for the Review Changes command.
 * These helpers run `git diff` and `git status` only. They never stage,
 * commit, or otherwise modify the repository.
 */

import type { ReviewScope } from "./prompts";

export type { ReviewScope };

export interface ChangedFile {
  readonly path: string;
  /** Added lines, or -1 when unknown (untracked file, binary). */
  readonly additions: number;
  /** Deleted lines, or -1 when unknown (untracked file, binary). */
  readonly deletions: number;
  readonly untracked: boolean;
}

export interface FileDiff {
  readonly path: string;
  readonly diff: string;
  readonly truncated: boolean;
}

/** Per-file diff cap: a launcher window is for reading, not scrolling. */
export const MAX_DIFF_LINES = 300;

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;

/** Runs git with the given args; resolves stdout. Injectable for tests. */
export type GitRunner = (args: readonly string[]) => Promise<string>;

export function createGitRunner(directory: string): GitRunner {
  return (args) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        [...args],
        { cwd: directory, encoding: "utf8", timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
        (error, stdout) => {
          if (error) {
            // `git diff --no-index` exits 1 when differences exist; stdout still holds the diff.
            if ((error as { code?: unknown }).code === 1 && stdout) {
              resolve(stdout);
              return;
            }
            reject(error instanceof Error ? error : new Error("git command failed"));
            return;
          }
          resolve(stdout);
        },
      );
    });
}

export async function checkGit(runner: GitRunner): Promise<boolean> {
  try {
    await runner(["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Base diff args for a scope. Branch scope diffs `base...HEAD` and requires
 * the base ref. Without it there is nothing meaningful to diff. The caller
 * gets `undefined` and should hide that scope.
 */
export function scopeDiffArgs(scope: ReviewScope, base: string | undefined): readonly string[] | undefined {
  if (scope === "staged") return ["diff", "--no-color", "--cached"];
  if (scope === "branch") {
    if (!base) return undefined;
    return ["diff", "--no-color", `${base}...HEAD`];
  }
  return ["diff", "--no-color"];
}

export function parseNumstat(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const columns = line.split("\t");
    if (columns.length < 3) continue;
    const [addedRaw, deletedRaw, ...rest] = columns as [string, string, ...string[]];
    const additions = addedRaw === "-" ? -1 : Number.parseInt(addedRaw, 10);
    const deletions = deletedRaw === "-" ? -1 : Number.parseInt(deletedRaw, 10);
    if (Number.isNaN(additions) || Number.isNaN(deletions)) continue;
    files.push({ path: rest.join("\t"), additions, deletions, untracked: false });
  }
  return files;
}

/** Parse NUL-separated `git status --porcelain=v1 -z` output for untracked (`??`) paths. */
export function parsePorcelainUntracked(output: string): string[] {
  const paths: string[] = [];
  for (const entry of output.split("\0")) {
    if (entry.startsWith("?? ")) paths.push(entry.slice(3));
  }
  return paths;
}

export async function listChangedFiles(
  runner: GitRunner,
  scope: ReviewScope,
  base?: string,
): Promise<ChangedFile[]> {
  const baseArgs = scopeDiffArgs(scope, base);
  if (!baseArgs) return [];
  const files = parseNumstat(await runner([...baseArgs, "--numstat", "--"]));
  if (scope === "working") {
    // `git diff` omits untracked files; a new file with secrets in it is
    // exactly what a review should catch, so include them via status.
    const porcelain = await runner(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--"]);
    const known = new Set(files.map((file) => file.path));
    for (const path of parsePorcelainUntracked(porcelain)) {
      if (!known.has(path)) files.push({ path, additions: -1, deletions: -1, untracked: true });
    }
  }
  return files;
}

export async function loadFileDiff(
  runner: GitRunner,
  scope: ReviewScope,
  file: ChangedFile,
  base?: string,
): Promise<FileDiff> {
  const args = file.untracked
    ? ["diff", "--no-color", "--no-index", "--", "/dev/null", file.path]
    : [...(scopeDiffArgs(scope, base) ?? ["diff", "--no-color"]), "--", file.path];
  const raw = await runner(args);
  const lines = raw.split("\n");
  if (lines.length > MAX_DIFF_LINES) {
    return { path: file.path, diff: lines.slice(0, MAX_DIFF_LINES).join("\n"), truncated: true };
  }
  return { path: file.path, diff: raw.trimEnd(), truncated: false };
}

/** Compact change summary for list accessories: "+12 -3", "new", or "binary". */
export function formatChangeStat(file: ChangedFile): string {
  if (file.untracked) return "new";
  if (file.additions < 0 || file.deletions < 0) return "binary";
  return `+${file.additions} -${file.deletions}`;
}
