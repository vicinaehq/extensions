import { findUpSync } from "find-up";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { Package } from "../types";
import { showToast, Toast } from "@vicinae/api";
import { PackageManager } from "./getPackageManager";

export const getInstalledPackages = (
  packageManager: PackageManager,
  path?: string,
) => {
  if (!path) {
    switch (packageManager) {
      case "npm":
        return getPackagesFromListCommand("npm ls -g --depth=0 --json");
      case "pnpm":
        return getPackagesFromListCommand("pnpm ls -g --depth=0 --json");
      case "bun":
        return getBunPackagesFromListCommand();
    }
  }

  const packageJsonPath = findUpSync("package.json", { cwd: path });
  if (!packageJsonPath) return [];

  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content) as PackageJsonRes;
    return [
      ...Object.entries(packageJson.dependencies || {}).map(
        ([name, version]) => ({ name, version, dev: false, global: false }),
      ),
      ...Object.entries(packageJson.devDependencies || {}).map(
        ([name, version]) => ({ name, version, dev: true, global: false }),
      ),
    ];
  } catch (error) {
    showToast({
      title: "Failed to parse package.json",
      message: error instanceof Error ? error.message : String(error),
      style: Toast.Style.Failure,
    });
    return [];
  }
};

const getPackagesFromListCommand = (command: string): Package[] => {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
    });
    const parsedOutput = JSON.parse(output) as PackageManagerListRes;

    return parsedOutput.dependencies
      ? Object.entries(parsedOutput.dependencies).map(([name, info]) => ({
          name,
          version: info.version,
          dev: false,
          global: true,
        }))
      : [];
  } catch {
    return [];
  }
};

const getBunPackagesFromListCommand = (): Package[] => {
  try {
    const output = execSync("bun pm ls -g", {
      encoding: "utf-8",
    });

    return output.split("\n").flatMap((line) => mapBunListLine(line));
  } catch {
    return [];
  }
};

const mapBunListLine = (line: string): Package[] => {
  const trimmedLine = line.trimStart();

  if (!trimmedLine.startsWith("├── ") && !trimmedLine.startsWith("└── ")) {
    return [];
  }

  const packageSpec = trimmedLine.replace(/^[├└]──\s*/, "");
  const versionSeparatorIndex = packageSpec.lastIndexOf("@");

  if (versionSeparatorIndex <= 0) return [];

  const name = packageSpec.slice(0, versionSeparatorIndex);
  const version = packageSpec.slice(versionSeparatorIndex + 1);

  if (!name || !version) return [];

  return [
    {
      name,
      version,
      dev: false,
      global: true,
    },
  ];
};

type PackageJsonRes = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type PackageManagerListRes = {
  dependencies?: Record<string, { version: string }>;
};
