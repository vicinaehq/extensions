import { showToast, Toast } from "@vicinae/api";
import { execSync } from "child_process";
import { useState } from "react";
import { getInstalledPackages } from "../utils/getPackageJson";
import type { PackageManager } from "../utils/getPackageManager";
import type { Package } from "../types";
import { usePackageManger } from "./usePackageManger";

export const useUninstallPackages = (path?: string) => {
  const [selectedPackages, setSelectedPackages] = useState<Package[]>([]);
  const [error, setError] = useState<string>("");
  const { packageManager } = usePackageManger(path);
  const [packages, setPackages] = useState<Package[]>(() =>
    getInstalledPackages(packageManager, path),
  );

  const npmCommand = buildUninstallCommand(
    packageManager,
    selectedPackages,
    !path,
  );

  const uninstallPackages = async () => {
    const uninstallToast = await showToast({
      title: `Uninstalling packages...`,
      style: Toast.Style.Animated,
    });

    try {
      execSync(npmCommand, {
        cwd: path,
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
    setPackages(getInstalledPackages(packageManager, path));
    setSelectedPackages([]);
  };

  const onSelectDependency = (dependency: Package) => {
    setSelectedPackages((prev) => {
      if (!prev.find((dep) => dep.name === dependency.name))
        return [...prev, dependency];
      return prev.filter((dep) => dep.name !== dependency.name);
    });
  };

  const clearError = () => setError("");

  return {
    uninstallPackages,
    npmCommand,
    error,
    packages,
    selectedPackages,
    onSelectDependency,
    clearError,
  };
};

const buildUninstallCommand = (
  packageManager: PackageManager,
  dependencies: Package[],
  global = false,
) => {
  switch (packageManager) {
    case "pnpm":
      return `pnpm remove ${dependencies.map((dep) => dep.name).join(" ")} ${global ? "-g" : ""}`;
    case "bun":
      return `bun remove ${dependencies.map((dep) => dep.name).join(" ")} ${global ? "-g" : ""}`;
    case "npm":
      return `npm uninstall ${dependencies.map((dep) => dep.name).join(" ")} ${global ? "-g" : ""}`;
  }
};
