import { showToast, Toast } from "@vicinae/api";
import { execSync } from "child_process";
import { useMemo, useState } from "react";
import { getPackageJson } from "../utils/getPackageJson";
import {
  getPackageManager,
  type PackageManager,
} from "../utils/getPackageManager";
import type { NPMProject } from "../types";

export const useUpdatePackages = (pwd: string) => {
  const [project, setProject] = useState<NPMProject>(getPackageJson(pwd));
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(
    [],
  );
  const [selectedDevDependencies, setSelectedDevDependencies] = useState<
    string[]
  >([]);
  const [error, setError] = useState<string>("");

  const packageManager = useMemo(() => getPackageManager(pwd), [pwd]);
  const npmCommand = buildUpdateCommand(
    packageManager,
    selectedDependencies,
    selectedDevDependencies,
  );

  const updatePackages = async () => {
    const updateToast = await showToast({
      title: `Updating packages...`,
      style: Toast.Style.Animated,
    });

    try {
      execSync(npmCommand, {
        cwd: pwd,
      });
    } catch (error) {
      if (error instanceof Error) setError(error.message);
      updateToast.hide();
      showToast({
        title: `Failed to update packages`,
        style: Toast.Style.Failure,
      });
      return;
    }
    updateToast.hide();
    showToast({
      title: `Successfully updated packages`,
      style: Toast.Style.Success,
    });
    setProject(getPackageJson(pwd));
    setSelectedDependencies([]);
    setSelectedDevDependencies([]);
  };

  const onSelectDevDependency = (dependency: string) => {
    setSelectedDevDependencies((prev) => {
      if (!prev.includes(dependency)) return [...prev, dependency];
      return prev.filter((dep) => dep !== dependency);
    });
  };

  const onSelectDependency = (dependency: string) => {
    setSelectedDependencies((prev) => {
      if (!prev.includes(dependency)) return [...prev, dependency];
      return prev.filter((dep) => dep !== dependency);
    });
  };

  const clearError = () => setError("");

  return {
    updatePackages,
    error,
    project,
    selectedDependencies,
    selectedDevDependencies,
    onSelectDependency,
    onSelectDevDependency,
    clearError,
    npmCommand,
  };
};

const buildUpdateCommand = (
  packageManager: PackageManager,
  dependencies: string[],
  devDependencies: string[],
) => {
  const deps = dependencies.map((name) => `${name}@latest`).join(" ");
  const devDeps = devDependencies.map((name) => `${name}@latest`).join(" ");

  switch (packageManager) {
    case "pnpm":
      return [
        deps ? `pnpm update ${deps}` : "",
        devDeps ? `pnpm update ${devDeps} --save-dev` : "",
      ]
        .filter(Boolean)
        .join(" && ");
    case "bun":
      return [
        deps ? `bun add ${deps}` : "",
        devDeps ? `bun add ${devDeps} -d` : "",
      ]
        .filter(Boolean)
        .join(" && ");
    case "npm":
      return [
        deps ? `npm install ${deps}` : "",
        devDeps ? `npm install ${devDeps} --save-dev` : "",
      ]
        .filter(Boolean)
        .join(" && ");
  }
};
