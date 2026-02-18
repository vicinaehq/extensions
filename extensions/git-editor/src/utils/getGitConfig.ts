import { execSync } from "child_process";

export const getGitConfig = (key: string) => {
  try {
    return execSync(`git config --global ${key}`, {
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
};
