import { closeMainWindow } from "@vicinae/api";
import { readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { useState } from "react";
import { getCommitMetadata } from "../utils/getCommitMetadata";

export const useRebase = (gitFile?: string) => {
  const [commits, setCommits] = useState<Commit[]>(
    gitFile ? readRebaseFile(gitFile) : [],
  );

  const startRebase = () => {
    if (!gitFile) return;
    const content = commits
      .toReversed()
      .map((commit) => `${commit.type} ${commit.hash} # ${commit.message}`)
      .join("\n");
    writeFileSync(gitFile, content);
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
  fullHash: string;
  naturalDate: string;
  date: string;
  author: string;
  branches: string[];
  tags: string[];
  fileStats: {
    added: number;
    modified: number;
    removed: number;
  };
  type: CommitType;
};

export type CommitType =
  | "pick"
  | "reword"
  | "edit"
  | "squash"
  | "fixup"
  | "drop";

const readRebaseFile = (gitFile: string) => {
  const content = readFileSync(gitFile, "utf-8");

  let commits = content
    .split("\n")
    .filter((line) => !line.startsWith("#") && line);

  const gitDir = dirname(gitFile);

  const mappedCommits = commits
    .map((line) => {
      const [meta, message] = line.split(" # ");
      const [type, hash] = meta.split(" ");
      const metadata = getCommitMetadata(hash, gitDir);
      return {
        type: type as CommitType,
        hash,
        fullHash: metadata.fullHash,
        message: message.trim(),
        naturalDate: metadata.naturalDate,
        date: metadata.date,
        author: metadata.author,
        branches: metadata.branches,
        tags: metadata.tags,
        fileStats: metadata.fileStats,
      };
    })
    .reverse();
  return mappedCommits;
};
