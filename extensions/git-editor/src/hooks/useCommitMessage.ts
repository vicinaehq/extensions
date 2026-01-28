import { readFile } from "fs/promises";
import { useEffect, useState } from "react";

export const useCommitMessage = (gitFile?: string) => {
  const [commitMessage, setCommitMessage] = useState("");

  useEffect(() => {
    const fetchFileContent = async () => {
      if (!gitFile) return;
      const content = await readFile(gitFile, "utf-8");

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
      setCommitMessage(commitMessage);
    };
    fetchFileContent();
  }, [gitFile]);

  return { commitMessage, setCommitMessage };
};
