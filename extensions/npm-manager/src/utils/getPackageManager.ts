import { readFileSync } from "fs";
import { findUpSync } from "find-up";

export type PackageManager = "npm" | "pnpm" | "bun";

export const getPackageManager = (pwd: string): PackageManager => {
  const packageManagerFromManifest = getPackageManagerFromManifest(pwd);
  if (packageManagerFromManifest) return packageManagerFromManifest;
  if (
    findUpSync("bun.lockb", { cwd: pwd }) ||
    findUpSync("bun.lock", { cwd: pwd })
  ) {
    return "bun";
  }

  if (findUpSync("pnpm-lock.yaml", { cwd: pwd })) return "pnpm";

  return "npm";
};

const getPackageManagerFromManifest = (
  pwd: string,
): PackageManager | undefined => {
  const packageJsonPath = findUpSync("package.json", { cwd: pwd });
  if (!packageJsonPath) return;
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      packageManager?: string;
    };
    if (!packageJson.packageManager) return;
    if (packageJson.packageManager.startsWith("bun@")) return "bun";
    if (packageJson.packageManager.startsWith("pnpm@")) return "pnpm";
    if (packageJson.packageManager.startsWith("npm@")) return "npm";
  } catch {
    return;
  }

  return;
};
