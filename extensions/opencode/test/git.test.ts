import { describe, test, expect } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import {
  checkGit,
  createGitRunner,
  listChangedFiles,
  loadFileDiff,
  parseNumstat,
  parsePorcelainUntracked,
  MAX_DIFF_LINES,
  type GitRunner,
} from "../src/lib/git";

function fakeRunner(responses: Record<string, string>): GitRunner {
  return async (args) => {
    const key = args.join(" ");
    for (const [prefix, output] of Object.entries(responses)) {
      if (key.startsWith(prefix)) return output;
    }
    throw new Error(`unexpected git call: ${key}`);
  };
}

describe("git output parsing", () => {
  // `--numstat` and `--porcelain=v1 -z` are git's external contract; these pin
  // that the documented formats parse into the file list the UI shows.
  test("numstat parses additions, deletions, paths, and binary markers", () => {
    const files = parseNumstat("12\t3\tsrc/a.ts\n-\t-\tassets/logo.png\n");
    expect(files).toEqual([
      { path: "src/a.ts", additions: 12, deletions: 3, untracked: false },
      { path: "assets/logo.png", additions: -1, deletions: -1, untracked: false },
    ]);
  });

  test("numstat rename entries carry both paths", () => {
    const files = parseNumstat("5\t2\told/name.ts\tnew/name.ts\n");
    expect(files).toEqual([{ path: "old/name.ts\tnew/name.ts", additions: 5, deletions: 2, untracked: false }]);
  });

  test("porcelain -z collects untracked paths", () => {
    const output = " M src/a.ts\0?? new-file.ts\0A  staged.ts\0";
    expect(parsePorcelainUntracked(output)).toEqual(["new-file.ts"]);
  });

  test("empty output means no changes and nothing untracked", () => {
    expect(parseNumstat("")).toEqual([]);
    expect(parsePorcelainUntracked("")).toEqual([]);
  });
});

describe("diff truncation", () => {
  test("long diffs truncate to the line cap and say so", async () => {
    const big = Array.from({ length: MAX_DIFF_LINES + 50 }, (_, i) => `+line ${i}`).join("\n");
    const diff = await loadFileDiff(fakeRunner({ diff: big }), "working", {
      path: "big.ts",
      additions: 999,
      deletions: 0,
      untracked: false,
    });
    expect(diff.truncated).toBe(true);
    expect(diff.diff.split("\n")).toHaveLength(MAX_DIFF_LINES);
  });
});

describe("real git repository", () => {
  function sh(cmd: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { cwd, encoding: "utf8" }, (error, stdout) =>
        error ? reject(error) : resolve(stdout),
      );
    });
  }

  test("working-tree review sees modified and untracked files end to end", async () => {
    const available = await checkGit(createGitRunner(tmpdir()));
    if (!available) return; // git is required for this test; CI images may lack it.

    const dir = await mkdtemp(join(tmpdir(), "opencode-review-test-"));
    try {
      const git = (args: string[]) => sh("git", args, dir);
      await git(["init", "-b", "main"]);
      await writeFile(join(dir, "tracked.txt"), "one\n");
      await git(["add", "tracked.txt"]);
      await git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]);
      await writeFile(join(dir, "tracked.txt"), "one\ntwo\n");
      await writeFile(join(dir, "new.txt"), "hello\n");

      const runner = createGitRunner(dir);
      const working = await listChangedFiles(runner, "working");
      const paths = working.map((file) => file.path).sort();
      expect(paths).toEqual(["new.txt", "tracked.txt"]);
      expect(working.find((file) => file.path === "new.txt")?.untracked).toBe(true);

      const diff = await loadFileDiff(
        runner,
        "working",
        working.find((file) => file.path === "tracked.txt")!,
      );
      expect(diff.diff).toContain("+two");
      expect(diff.truncated).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
