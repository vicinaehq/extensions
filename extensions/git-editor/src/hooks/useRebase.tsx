import { closeMainWindow } from "@vicinae/api";
import { readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { useEffect, useState } from "react";
import { getCommitDate } from "../utils/getCommitDate";

export const useRebase = (gitFile?: string) => {
  const [commits, setCommits] = useState<Commit[]>([]);

  useEffect(() => {
    const fetchFileContent = async () => {
      if (!gitFile) return;
      const content = await readFile(gitFile, "utf-8");

      let commits = content
        .split("\n")
        .filter((line) => !line.startsWith("#") && line);

      const gitDir = dirname(gitFile);

      const mappedCommits = commits
        .map((line) => {
          const [meta, message] = line.split(" # ");
          const [type, hash] = meta.split(" ");
          return {
            type: type as CommitType,
            hash,
            message: message.trim(),
            date: getCommitDate(hash, gitDir),
          };
        })
        .reverse();

      setCommits(mappedCommits);
    };
    fetchFileContent();
  }, [gitFile]);

  const startRebase = async () => {
    if (!gitFile) return;
    const content = commits
      .toReversed()
      .map((commit) => `${commit.type} ${commit.hash} # ${commit.message}`)
      .join("\n");
    writeFile(gitFile, content);
    closeMainWindow();
  };

  const moveCommitDown = (commit: Commit) => {
    setCommits((prev) => {
      const currentIndex = prev.findIndex((c) => c.hash === commit.hash);
      if (currentIndex >= prev.length - 1) return prev;
      const tempCurrent = prev[currentIndex];
      const tempBelow = prev[currentIndex + 1];
      const newCommits = [...prev];
      newCommits[currentIndex + 1] = tempCurrent;
      newCommits[currentIndex] = tempBelow;
      return newCommits;
    });
  };

  const moveCommitUp = (commit: Commit) => {
    setCommits((prev) => {
      const currentIndex = prev.findIndex((c) => c.hash === commit.hash);
      if (currentIndex <= 0) return prev;
      const tempCurrent = prev[currentIndex];
      const tempAbove = prev[currentIndex - 1];
      const newCommits = [...prev];
      newCommits[currentIndex - 1] = tempCurrent;
      newCommits[currentIndex] = tempAbove;
      return newCommits;
    });
  };

  const updateCommit = (commit: Commit, type: CommitType) => {
    setCommits(
      commits.map((c) => (c.hash === commit.hash ? { ...c, type } : c)),
    );
  };

  return {
    commits,
    setCommits,
    startRebase,
    moveCommitUp,
    moveCommitDown,
    updateCommit,
  };
};

type Commit = {
  message: string;
  hash: string;
  date: string;
  type: CommitType;
};

export type CommitType =
  | "pick"
  | "reword"
  | "edit"
  | "squash"
  | "fixup"
  | "drop";
