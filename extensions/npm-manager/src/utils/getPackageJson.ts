import { findUpSync } from "find-up";
import { readFileSync } from "fs";

export const getPackageJson = (pwd: string) => {
  const packageJsonPath = findUpSync("package.json", { cwd: pwd });
  if (!packageJsonPath) {
    return {
      dependencies: [],
    };
  }

  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content) as PackageJsonRes;
    return {
      dependencies: [
        ...Object.entries(packageJson.dependencies || {}).map(
          ([name, version]) => ({ name, version, dev: false }),
        ),
        ...Object.entries(packageJson.devDependencies || {}).map(
          ([name, version]) => ({ name, version, dev: true }),
        ),
      ],
    };
  } catch (error) {
    console.error("Failed to parse package.json:", error);
    return {
      dependencies: [],
    };
  }
};

type PackageJsonRes = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
