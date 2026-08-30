import { execSync } from "node:child_process";

export const isCrocInstalled = () => {
  try {
    execSync("croc --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
