import { readFileSync } from "fs";
import { useEffect, useState } from "react";

export const useCommitMessage = (gitFile?: string) => {
  const [commitMessage, setCommitMessage] = useState(
    gitFile ? getCommitMessages(gitFile) : "",
  );

  return { commitMessage, setCommitMessage };
};

const getCommitMessages = (gitFile: string) => {
  if (!gitFile) return "";
  const content = readFileSync(gitFile, "utf-8");

  const verboseStart = content
    .split("\n")
    .findIndex((line) => line.includes(">8"));

  const fileContentWithVerbose =
    verboseStart !== -1
      ? content.split("\n").slice(0, verboseStart)
      : content.split("\n");

  const commitMessage = fileContentWithVerbose
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();
  return commitMessage;
};
