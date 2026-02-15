import { showToast, Toast, Clipboard } from "@vicinae/api";
import { execSync } from "child_process";
import { useMemo, useState } from "react";
import { getPackageJson } from "../utils/getPackageJson";
import {
  getPackageManager,
  type PackageManager,
} from "../utils/getPackageManager";
import type { NPMProject } from "../types";

export const useUninstallPackages = (pwd: string) => {
  const [project, setProject] = useState<NPMProject>(getPackageJson(pwd));
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(
    [],
  );
  const [error, setError] = useState<string>("");

  const packageManager = useMemo(() => getPackageManager(pwd), [pwd]);
  const npmCommand = buildUninstallCommand(
    packageManager,
    selectedDependencies,
  );

  const uninstallPackages = async () => {
    const uninstallToast = await showToast({
      title: `Uninstalling packages...`,
      style: Toast.Style.Animated,
    });
    try {
      execSync(npmCommand, {
        cwd: pwd,
      });
    } catch (error) {
      if (error instanceof Error) setError(error.message);
      uninstallToast.hide();
      showToast({
        title: `Failed to uninstall packages`,
        style: Toast.Style.Failure,
      });
      return;
    }
    uninstallToast.hide();
    showToast({
      title: `Successfully uninstalled packages`,
      style: Toast.Style.Success,
    });
    setProject(getPackageJson(pwd));
    setSelectedDependencies([]);
  };

  const onSelectDependency = (dependency: string) => {
    setSelectedDependencies((prev) => {
      if (!prev.includes(dependency)) return [...prev, dependency];
      return prev.filter((dep) => dep !== dependency);
    });
  };

  const clearError = () => setError("");

  return {
    uninstallPackages,
    npmCommand,
    error,
    project,
    selectedDependencies,
    onSelectDependency,
    clearError,
  };
};

const buildUninstallCommand = (
  packageManager: PackageManager,
  dependencies: string[],
) => {
  switch (packageManager) {
    case "pnpm":
      return `pnpm remove ${dependencies.join(" ")}`;
    case "bun":
      return `bun remove ${dependencies.join(" ")}`;
    case "npm":
      return `npm uninstall ${dependencies.join(" ")}`;
  }
};
