import { showToast, Toast } from "@vicinae/api";
import { execSync } from "child_process";
import { useMemo, useState } from "react";
import { getPackageJson } from "../utils/getPackageJson";
import {
  getPackageManager,
  type PackageManager,
} from "../utils/getPackageManager";
import type { NPMProject } from "../types";
import type { NPMPackage } from "./useNpmSeach";

export const useInstallPackages = (pwd: string) => {
  const [project, setProject] = useState<NPMProject>(getPackageJson(pwd));
  const [selectedDependencies, setSelectedDependencies] = useState<
    NPMPackage[]
  >([]);
  const [error, setError] = useState<string>("");

  const packageManager = useMemo(() => getPackageManager(pwd), [pwd]);
  const npmCommand = buildInstallCommand(packageManager, selectedDependencies);

  const installPackages = async (dev = false) => {
    const installToast = await showToast({
      title: `Installing packages...`,
      style: Toast.Style.Animated,
    });
    const command = buildInstallCommand(
      packageManager,
      selectedDependencies,
      dev,
    );
    try {
      if (selectedDependencies.length > 0) {
        execSync(command, {
          cwd: pwd,
        });
      }
    } catch (error) {
      if (error instanceof Error) setError(error.message);
      installToast.hide();
      showToast({
        title: `Failed to install packages`,
        style: Toast.Style.Failure,
      });
      return;
    }
    installToast.hide();
    showToast({
      title: `Successfully installed packages`,
      style: Toast.Style.Success,
    });
    setProject(getPackageJson(pwd));
    setSelectedDependencies([]);
  };

  const onSelectDependency = (dependency: NPMPackage) => {
    setSelectedDependencies((prev) => {
      const alreadySelected = prev.some((dep) => dep.name === dependency.name);
      if (!alreadySelected) return [...prev, dependency];
      return prev.filter((dep) => dep.name !== dependency.name);
    });
  };

  const clearError = () => setError("");

  return {
    installPackages,
    error,
    project,
    selectedDependencies,
    npmCommand,
    onSelectDependency,
    clearError,
  };
};

const buildInstallCommand = (
  packageManager: PackageManager,
  pkgNames: NPMPackage[],
  dev?: boolean,
) => {
  const pkgs = pkgNames.map((pkg) => pkg.name).join(" ");
  switch (packageManager) {
    case "pnpm":
      return `pnpm add ${pkgs}${dev ? " --save-dev" : ""}`;
    case "bun":
      return `bun add ${pkgs}${dev ? " -d" : ""}`;
    case "npm":
      return `npm install ${pkgs}${dev ? " --save-dev" : ""}`;
  }
};
